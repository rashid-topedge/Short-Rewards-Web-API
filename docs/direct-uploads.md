# Direct uploads to Backblaze

Vercel (and some other hosts) reject request bodies over **4.5 MB** with
`HTTP 413`, but Backblaze needs upload parts of at least **5 MB**. So the
admin console sends video and image bytes **straight from the browser to
Backblaze**; our API only hands out upload links and records progress.

## How it works

1. `POST /api/admin/upload-chunk/init` creates the session and replies with
   `uploadMode: "direct"` when the bucket accepts browser uploads.
2. `POST /api/admin/upload-chunk/target` returns where to send the bytes:
   - files over 5 MB: a B2 *upload part URL* + token (`b2_get_upload_part_url`)
     that can only add parts to that one file;
   - files up to 5 MB: a presigned S3 `PUT` URL for that exact file name, valid 1 hour.
3. The browser uploads each 5 MB part (with its SHA-1), then reports it with
   `POST /api/admin/upload-chunk/part` (`{ sessionId, chunkIndex, sha1 }`, no bytes).
4. `POST /api/admin/upload-chunk/complete` finishes the file in B2 (B2 checks
   every part's SHA-1) or, for small files, checks the file exists.

Upload links only work for the file being uploaded, so moderators still can't
overwrite other files. If the browser can't reach Backblaze directly, the upload
switches to the old path through the server automatically (fine for files under
4.5 MB, or on hosts without that limit).

## Bucket CORS rules (one-time)

Browsers need two CORS rules on each bucket you upload to (reels, dramas, payouts).
On the first upload the server adds them itself, **if** the bucket's Backblaze
key has the `writeBuckets` capability. Existing rules are kept.

If the key can't change bucket settings (keys made in the Backblaze web UI
usually can't), uploads over 4.5 MB fail with a message pointing here. Add the
rules once with the [B2 command-line tool](https://www.backblaze.com/docs/cloud-storage-command-line-tools),
signed in with your **master** application key:

```bash
b2 bucket update --cors-rules '[
  {"corsRuleName":"dramflix-direct-uploads-b2","allowedOrigins":["*"],"allowedOperations":["b2_upload_part"],
   "allowedHeaders":["authorization","content-type","x-bz-part-number","x-bz-content-sha1"],"maxAgeSeconds":3600},
  {"corsRuleName":"dramflix-direct-uploads-s3","allowedOrigins":["*"],"allowedOperations":["s3_put"],
   "allowedHeaders":["content-type"],"maxAgeSeconds":3600}
]' YOUR_BUCKET_NAME
```

`--cors-rules` **replaces** the bucket's rules: if the bucket already has
rules (for example for downloads), include them in the list too. You can see
the current ones with `b2 bucket get YOUR_BUCKET_NAME`.

Any origin is allowed because each upload is authorised by its own short-lived
token or signature, not by the website it comes from.

After adding the rules, uploads switch to direct mode within 10 minutes (or
right away after a redeploy/restart).

## Requirements

- The Backblaze application key must work with the S3-compatible API (keys
  created after May 2020 do).
- The admin console must be served over HTTPS (or localhost), which browsers
  require for computing SHA-1 checksums.

## Splitting long videos into parts

In **Upload reels**, "Split videos longer than 3 minutes into 3-minute parts" is on by default.

- Runs in the browser (`lib/mp4Split.ts`), before uploading: no ffmpeg, no server work, no re-encoding.
  Cuts are made at the nearest keyframe, so parts are about 3 minutes (a few seconds either way).
- A 7-minute video becomes 3 reels: "Title (Part 1/3)" 3:00, "(Part 2/3)" 3:00, "(Part 3/3)" 1:00.
  A last part under 30 seconds is added to the previous part instead (e.g. 6:20 → 3:00 + 3:20).
- Parts share one `part_group` in the `reels` table (`part_number`, `part_count`); each pays its own reward.
  The app gets them with `GET /api/reels?partGroup=…` (see docs/user-auth-api.md).
- MP4/MOV only. WebM/MKV and fragmented MP4 files upload whole, with a note on the card.
- Videos 3:30 or shorter (3 minutes + the 30-second merge allowance) aren't split.

### Drama episodes

**Upload episodes** has the same toggle (on by default), but each part becomes its own **episode**
with the next number, and each pays the episode reward:

- `EP 01.mp4` (7 min) + `EP 02.mp4` → episodes 1, 2, 3 (the parts of EP 01) and 4 (EP 02). Files after a
  split move up to make room; the card says "moved up to make room for the parts before it".
- Parts are stored as `EP-01_part1.mp4`, `_part2`, … in the drama's folder, each with its own thumbnail.
- Only numbers in this upload batch move. Episodes already saved on the drama are never renumbered
  (that would change which episodes users were paid for); a clash shows "Episode N already exists"
  with the option to replace it, and every number can still be edited before saving.
- The app sees ordinary episodes; there are no new fields.

## File names in the bucket

- Files keep their own name, cleaned for URLs: spaces and symbols become `-` ("My Clip (1).mp4" → `My-Clip-1.mp4`). Letters outside A–Z (e.g. Urdu) can't be used in the name; a name with none left becomes `video.mp4` / `file.jpg`.
- If the name is already taken in that folder (in B2, or by another upload in progress), the file becomes `My-Clip-2.mp4`, `-3`, … Nothing is ever overwritten. (Before, every reel and moderator upload got a random prefix like `m2x9k1_a3f9c0_`.)
- The final name is returned as `storedAs` by `/api/admin/upload-chunk/init`.

## Drama folders

- Each drama has its own folder: `dramas/<dramaId>-<title>/` (e.g. `dramas/42-love-war/`), saved in `dramas.storage_folder` the first time something is uploaded for it. It stays the same if the title changes later.
- A new drama's cover, uploaded before the drama is saved, goes to `dramas/<title>-<random>/`, and the drama keeps using that folder.
- Older files stay where they are; only new uploads use the new folders.
- **Episodes → Upload episodes** uploads many videos at once (2 in parallel, straight to B2). Numbers come from the file names ("EP 05.mp4", "S01E05", "Drama_5.mp4" → 5; quality tags like "720p" are ignored); files without a number get the next free number. An existing episode is only replaced if you tick "Replace".

## Dramas and episodes (database version 15)

- **Your own content only.** On the first start of this version, the database switches once:
  - `dramas` is cleaned up in place (it isn't renamed, because reels point at it): dramas with no creator (scraped) are copied to `dramas_scraped` and removed, the unused `raw_json` / `fetched_at` columns are dropped, and dates become milliseconds.
  - `episodes` is rebuilt, keyed on (drama, episode), with `title`, `thumbnail_url` and `duration_seconds`. The old table is kept as `episodes_scraped`.
  - Episodes of the remaining dramas are moved across; reels whose drama no longer exists are unlinked (the reels stay).
  - New drama IDs always go above every ID used before (stored as `drama_id_floor` in `admin_config`).
  - Drop `dramas_scraped` and `episodes_scraped` whenever you like; nothing reads them.
- **Upload episodes** now also reads each video's length, grabs a thumbnail (stored next to the video as `<file name>.jpg`), and lets you set a title and Published / Draft per episode.
- **Episode list** (Episodes button on a drama): publish / unpublish, edit title, replace video (new file, new thumbnail and length; old files removed), preview, delete.
- **Publishing a drama** no longer changes its episodes; each episode keeps its own Published / Draft setting.
- **Private bucket.** Covers, videos and thumbnails are served with signed links (valid for at least a day), in the app API and in the console.
- `cover_url_b2` and `url_b2` are kept, unused, for later.
- The old scraper import scripts (`migrate.js`, `migrate-table.js`, `migrate-episodes-*.js`, `setup-turso-tables.js`) write the old columns; don't run them against this database.

## Checking a bucket for real (Settings → Full check)

Each bucket on **Storage & B2 Keys** has a **Full check (saved settings)** button (admin only). It runs the real path once against Backblaze and reports every step:

1. Settings found, and the key is accepted.
2. Key permissions: `writeFiles`, `shareFiles` (signed links), `readFiles`, `listFiles`, `deleteFiles`.
3. Bucket found; for **payouts** a public bucket is an error (receipts show account details).
4. Uploads a 1×1 test image, makes the link the app would get, and downloads the image through it.
5. Checks that an unsigned link is refused (private bucket).
6. Checks direct browser uploads (needed on Vercel for files over 4.5 MB).
7. Deletes the test file.

If **Signed link** fails, the app can't show screenshots, covers or videos from that bucket: create a key with `shareFiles`. Whether a bucket is private or public is re-checked every 10 minutes, so switching it in Backblaze takes effect without a redeploy.
