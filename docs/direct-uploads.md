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

## File names in the bucket

- Files keep their own name, cleaned for URLs: spaces and symbols become `-` ("My Clip (1).mp4" → `My-Clip-1.mp4`). Letters outside A–Z (e.g. Urdu) can't be used in the name; a name with none left becomes `video.mp4` / `file.jpg`.
- If the name is already taken in that folder (in B2, or by another upload in progress), the file becomes `My-Clip-2.mp4`, `-3`, … Nothing is ever overwritten. (Before, every reel and moderator upload got a random prefix like `m2x9k1_a3f9c0_`.)
- The final name is returned as `storedAs` by `/api/admin/upload-chunk/init`.

## Drama folders

- Each drama has its own folder: `dramas/<dramaId>-<title>/` (e.g. `dramas/42-love-war/`), saved in `dramas.storage_folder` the first time something is uploaded for it. It stays the same if the title changes later.
- A new drama's cover, uploaded before the drama is saved, goes to `dramas/<title>-<random>/`, and the drama keeps using that folder.
- Older files stay where they are; only new uploads use the new folders.
- **Episodes → Upload episodes** uploads many videos at once (2 in parallel, straight to B2). Numbers come from the file names ("EP 05.mp4", "S01E05", "Drama_5.mp4" → 5; quality tags like "720p" are ignored); files without a number get the next free number. An existing episode is only replaced if you tick "Replace".
