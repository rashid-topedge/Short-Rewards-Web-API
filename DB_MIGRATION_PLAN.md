# DB Migration Plan — Backblaze B2 Video URLs

## Why
Drama covers and episode videos must be served from Backblaze B2 instead of arbitrary text URLs so the admin console folder upload is actually used.

## Migration SQL (run via Turso / libsql console, or add to `lib/db.ts` `createSchema()` as ALTER statements in a loop)

```sql
-- 1. Add B2 URL columns to dramas (already has `cover`, but keep it; add `cover_url_b2` if you want dual-track)
ALTER TABLE dramas ADD COLUMN cover_url_b2 TEXT;

-- 2. Add B2 URL column to episodes (already `url`; keep for backward compat)
ALTER TABLE episodes ADD COLUMN url_b2 TEXT;

-- 3. Add B2 URL column to reels (already `video_url`)
ALTER TABLE reels ADD COLUMN video_url_b2 TEXT;

-- 4. Add B2 URL to payouts (already `receipt_url`)
ALTER TABLE redemption_requests ADD COLUMN receipt_url_b2 TEXT;

-- 5. Add B2 config fields to system_settings (already key/value; just insert rows)
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES
  ('b2_key_id', '', 0),
  ('b2_application_key', '', 0),
  ('b2_bucket_name', '', 0),
  ('b2_endpoint', 's3.us-west-004.backblazeb2.com', 0),
  ('b2_public_url', '', 0);
```

## File structure for B2 uploads
- `backblaze-b2` SDK uploads to bucket `/{folderType}/{targetName}/{filename}`
- `folderType`: `dramas`, `reels`, `payouts`
- `targetName`: drama slug / reel id / payout ref
- Admin console form picks folder (`<input type="file" webkitdirectory directory>`) then calls `/api/admin/upload-folder` with `folderType`, `targetName`, and `files`.

## Admin console changes needed
- `app/admin/(console)/dramas/page.tsx`: Replace Cover Image URL input with file picker for folder upload; add episode folder picker that sends files to `folderType=dramas`, `targetName=<slug>`.
- `app/admin/(console)/reels/page.tsx`: Add folder upload for reel video + thumbnail to `folderType=reels`.
- `app/admin/payouts/page.tsx`: Update receipt upload to use `/api/admin/upload-folder` with `folderType=payouts`.

## Service layer (`lib/db.ts` / new `lib/b2.ts`)
Create `lib/b2.ts` to wrap `backblaze-b2` authorization + upload, reuse in `upload-folder/route.ts`.
