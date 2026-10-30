import B2, { B2Bucket } from "backblaze-b2";
import { getSystemSettings } from "@/lib/db";
import fs from "fs";
import path from "path";

export type FolderType = "dramas" | "reels" | "payouts";

export interface B2Config {
  keyId: string;
  applicationKey: string;
  bucketId: string;
  publicUrl: string;
  endpoint: string;
}

interface CachedClient {
  client: B2;
  authorizedAt: number;
  downloadUrl?: string;
  apiUrl?: string;
  authorizationToken?: string;
  accountId?: string;
  s3ApiUrl?: string;
  capabilities?: string[];
}

// In-memory cache for authorized B2 clients (auth tokens last 24h)
const clientCache = new Map<string, CachedClient>();

/**
 * Resolves B2 credentials for a specific folder category (dramas, reels, payouts)
 * checking per-bucket overrides first, then global S3/B2 keys, then environment variables.
 */
export async function getB2ConfigForFolder(folderType: FolderType): Promise<B2Config | null> {
  const settings = await getSystemSettings();

  let keyId = "";
  let applicationKey = "";
  let bucketId = "";
  let publicUrl = "";
  const endpoint = settings.s3Endpoint || process.env.B2_ENDPOINT || "s3.us-west-004.backblazeb2.com";

  if (folderType === "dramas") {
    keyId = settings.b2DramasKeyId || settings.s3AccessKey || process.env.B2_DRAMAS_KEY_ID || process.env.B2_KEY_ID || "";
    applicationKey = settings.b2DramasAppKey || settings.s3SecretKey || process.env.B2_DRAMAS_APP_KEY || process.env.B2_APPLICATION_KEY || "";
    bucketId = settings.b2DramasBucketId || settings.s3Bucket || process.env.B2_DRAMAS_BUCKET_ID || process.env.B2_BUCKET_ID || "";
    publicUrl = settings.b2DramasPublicUrl || settings.s3PublicUrl || process.env.B2_DRAMAS_PUBLIC_URL || process.env.B2_PUBLIC_URL || "";
  } else if (folderType === "reels") {
    keyId = settings.b2ReelsKeyId || settings.s3AccessKey || process.env.B2_REELS_KEY_ID || process.env.B2_KEY_ID || "";
    applicationKey = settings.b2ReelsAppKey || settings.s3SecretKey || process.env.B2_REELS_APP_KEY || process.env.B2_APPLICATION_KEY || "";
    bucketId = settings.b2ReelsBucketId || settings.s3Bucket || process.env.B2_REELS_BUCKET_ID || process.env.B2_BUCKET_ID || "";
    publicUrl = settings.b2ReelsPublicUrl || settings.s3PublicUrl || process.env.B2_REELS_PUBLIC_URL || process.env.B2_PUBLIC_URL || "";
  } else if (folderType === "payouts") {
    keyId = settings.b2PayoutsKeyId || settings.s3AccessKey || process.env.B2_PAYOUTS_KEY_ID || process.env.B2_KEY_ID || "";
    applicationKey = settings.b2PayoutsAppKey || settings.s3SecretKey || process.env.B2_PAYOUTS_APP_KEY || process.env.B2_APPLICATION_KEY || "";
    bucketId = settings.b2PayoutsBucketId || settings.s3Bucket || process.env.B2_PAYOUTS_BUCKET_ID || process.env.B2_BUCKET_ID || "";
    publicUrl = settings.b2PayoutsPublicUrl || settings.s3PublicUrl || process.env.B2_PAYOUTS_PUBLIC_URL || process.env.B2_PUBLIC_URL || "";
  }

  keyId = keyId.trim();
  applicationKey = applicationKey.trim();
  bucketId = bucketId.trim();
  publicUrl = publicUrl.trim();

  if (keyId && applicationKey && bucketId) {
    return {
      keyId,
      applicationKey,
      bucketId,
      publicUrl,
      endpoint,
    };
  }

  return null;
}

/**
 * Obtains an authorized Backblaze B2 client, reusing cached tokens if still valid (< 20 hours).
 */
export async function getB2Client(keyId: string, applicationKey: string): Promise<{ client: B2; downloadUrl: string }> {
  const cacheKey = `${keyId}:${applicationKey}`;
  const now = Date.now();
  const cached = clientCache.get(cacheKey);

  // B2 tokens are valid for 24h, refresh every 18 hours (64800000ms)
  if (cached && now - cached.authorizedAt < 18 * 60 * 60 * 1000) {
    return {
      client: cached.client,
      downloadUrl: cached.downloadUrl || "",
    };
  }

  const client = new B2({
    applicationKeyId: keyId,
    applicationKey: applicationKey,
    retry: { retries: 3 },
  });

  const authRes = await client.authorize();
  const downloadUrl = authRes.data.downloadUrl;
  const apiUrl = authRes.data.apiUrl;

  clientCache.set(cacheKey, {
    client,
    authorizedAt: now,
    downloadUrl,
    apiUrl,
    authorizationToken: authRes.data.authorizationToken,
    accountId: authRes.data.accountId,
    s3ApiUrl: authRes.data.s3ApiUrl,
    capabilities: authRes.data.allowed?.capabilities,
  });

  return { client, downloadUrl };
}

/** Raw account details from the (cached) authorization, for native API calls the library doesn't wrap. */
export async function getB2AuthInfo(
  keyId: string,
  applicationKey: string
): Promise<{ client: B2; apiUrl: string; authorizationToken: string; accountId: string; s3ApiUrl: string | null; capabilities: string[] }> {
  const { client } = await getB2Client(keyId, applicationKey);
  const c = clientCache.get(`${keyId}:${applicationKey}`);
  return {
    client,
    apiUrl: c?.apiUrl || "",
    authorizationToken: c?.authorizationToken || "",
    accountId: c?.accountId || "",
    s3ApiUrl: c?.s3ApiUrl || null,
    capabilities: c?.capabilities || [],
  };
}

/**
 * Tests credentials and bucket accessibility against Backblaze B2 API.
 */
export async function testB2Connection(creds: {
  keyId: string;
  applicationKey: string;
  bucketId: string;
}): Promise<{
  success: boolean;
  bucketName?: string;
  bucketType?: string;
  message: string;
}> {
  try {
    const { keyId, applicationKey, bucketId } = creds;
    if (!keyId || !applicationKey || !bucketId) {
      return {
        success: false,
        message: "Missing required parameters: Key ID, Application Key, and Bucket ID are required.",
      };
    }

    const { client } = await getB2Client(keyId, applicationKey);
    const bucketsRes = await client.listBuckets();
    const buckets = bucketsRes.data.buckets || [];
    const matched = buckets.find((b: B2Bucket) => b.bucketId === bucketId);

    if (matched) {
      return {
        success: true,
        bucketName: matched.bucketName,
        bucketType: matched.bucketType,
        message: `Successfully connected to bucket "${matched.bucketName}" (${matched.bucketType})!`,
      };
    }

    // Try getBucket directly in case listBuckets is restricted by application key permissions
    try {
      const singleBucket = await client.getBucket({ bucketId });
      const b = singleBucket.data.buckets?.[0];
      if (b) {
        return {
          success: true,
          bucketName: b.bucketName,
          bucketType: b.bucketType,
          message: `Successfully connected to bucket "${b.bucketName}"!`,
        };
      }
    } catch {
      // Ignore inner getBucket error
    }

    return {
      success: false,
      message: `Authentication succeeded, but bucket ID "${bucketId}" was not found or the application key has insufficient bucket permissions.`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `B2 Connection Failed: ${errorMsg}`,
    };
  }
}

// Bucket names/types never change for a bucket id, so cache them for the process.
const bucketInfoCache = new Map<string, { bucketName: string | null; bucketType: string | null }>();

async function getBucketInfo(client: B2, bucketId: string): Promise<{ bucketName: string | null; bucketType: string | null }> {
  const cached = bucketInfoCache.get(bucketId);
  if (cached) return cached;

  let info: { bucketName: string | null; bucketType: string | null } = { bucketName: null, bucketType: null };
  try {
    const single = await client.getBucket({ bucketId });
    const b = single.data.buckets?.[0];
    if (b?.bucketName) info = { bucketName: b.bucketName, bucketType: b.bucketType ?? null };
  } catch {
    // ignore
  }
  if (!info.bucketName) {
    try {
      const list = await client.listBuckets();
      const match = (list.data?.buckets || []).find((b: B2Bucket) => b.bucketId === bucketId);
      if (match?.bucketName) info = { bucketName: match.bucketName, bucketType: match.bucketType ?? null };
    } catch {
      // ignore
    }
  }
  if (info.bucketName) bucketInfoCache.set(bucketId, info);
  return info;
}

/**
 * Resolves the bucket name from a bucket ID using the B2 client (server-side). Cached.
 */
export async function resolveBucketName(client: B2, bucketId: string): Promise<string | null> {
  return (await getBucketInfo(client, bucketId)).bucketName;
}

export function buildPublicUrl(config: B2Config, b2FileName: string, downloadUrl?: string, bucketName?: string): string {
  if (config.publicUrl) {
    const cleanBase = config.publicUrl.replace(/\/$/, "");
    return `${cleanBase}/${b2FileName}`;
  }

  if (downloadUrl) {
    const cleanBase = downloadUrl.replace(/\/$/, "");
    const bucket = bucketName || config.bucketId;
    return `${cleanBase}/file/${bucket}/${b2FileName}`;
  }

  const bucket = bucketName || config.bucketId;
  return `https://${config.endpoint}/file/${bucket}/${b2FileName}`;
}

const B2_MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB minimum per part for B2 Large Files

/**
 * Uploads a buffer to Backblaze B2, automatically switching to Large File
 * multipart upload if buffer > 5MB.
 */
export async function uploadBufferToB2(options: {
  folderType: FolderType;
  b2FileName: string;
  buffer: Buffer;
  mimeType?: string;
}): Promise<{ url: string; fileId?: string; storage: "b2" }> {
  const { folderType, b2FileName, buffer, mimeType } = options;
  const config = await getB2ConfigForFolder(folderType);

  if (!config) {
    throw new Error(`No Backblaze B2 configuration found for bucket category: ${folderType}`);
  }

  const { client, downloadUrl } = await getB2Client(config.keyId, config.applicationKey);
  const bucketName = await resolveBucketName(client, config.bucketId);
  const fileSize = buffer.length;

  // Single file upload for files <= 5MB
  if (fileSize <= B2_MIN_PART_SIZE) {
    const uploadUrlRes = await client.getUploadUrl({ bucketId: config.bucketId });
    const { uploadUrl, authorizationToken } = uploadUrlRes.data;

    const res = await client.uploadFile({
      uploadUrl,
      uploadAuthToken: authorizationToken,
      fileName: b2FileName,
      data: buffer,
      mime: mimeType || "application/octet-stream",
    });

    const publicUrl = buildPublicUrl(config, b2FileName, downloadUrl, bucketName || undefined);
    return {
      url: publicUrl,
      fileId: res.data.fileId,
      storage: "b2",
    };
  }

  // Large file multipart upload for files > 5MB
  const startRes = await client.startLargeFile({
    bucketId: config.bucketId,
    fileName: b2FileName,
    contentType: mimeType || "application/octet-stream",
  });

  const fileId = startRes.data.fileId;
  const partSha1Array: string[] = [];

  try {
    let offset = 0;
    let partNumber = 1;

    while (offset < fileSize) {
      const nextOffset = Math.min(offset + B2_MIN_PART_SIZE, fileSize);
      const partBuffer = buffer.subarray(offset, nextOffset);

      // Backblaze upload part URLs should be fresh per part
      const partUrlRes = await client.getUploadPartUrl({ fileId });
      const { uploadUrl, authorizationToken } = partUrlRes.data;

      const uploadRes = await client.uploadPart({
        uploadUrl,
        uploadAuthToken: authorizationToken,
        partNumber,
        data: partBuffer,
      });

      partSha1Array.push(uploadRes.data.contentSha1);
      offset = nextOffset;
      partNumber++;
    }

    await client.finishLargeFile({
      fileId,
      partSha1Array,
    });

    const publicUrl = buildPublicUrl(config, b2FileName, downloadUrl, bucketName || undefined);
    return {
      url: publicUrl,
      fileId,
      storage: "b2",
    };
  } catch (largeFileErr) {
    // If multipart fails, attempt cancellation to avoid orphaned parts charges
    try {
      await client.cancelLargeFile({ fileId });
    } catch {
      // Ignore cancellation error
    }
    throw largeFileErr;
  }
}

/**
 * Fallback storage: saves file locally inside `public/uploads/{folderType}/{targetName}/{filename}`
 */
export function saveBufferLocally(options: {
  folderType: FolderType;
  targetName?: string;
  fileName: string;
  buffer: Buffer;
}): { url: string; storage: "local" } {
  const { folderType, targetName, fileName, buffer } = options;
  const sanitizedFilename = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Reels are stored flat in a single folder (no nested subfolder).
  const isFlat = folderType === "reels" || !targetName;

  if (isFlat) {
    const uploadDir = path.resolve(process.cwd(), "public", "uploads", folderType);
    fs.mkdirSync(uploadDir, { recursive: true });
    const fullPath = path.join(uploadDir, sanitizedFilename);
    fs.writeFileSync(fullPath, buffer);
    return {
      url: `/uploads/${folderType}/${sanitizedFilename}`,
      storage: "local",
    };
  }

  const sanitizedTarget = targetName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uploadDir = path.resolve(process.cwd(), "public", "uploads", folderType, sanitizedTarget);
  fs.mkdirSync(uploadDir, { recursive: true });

  const fullPath = path.join(uploadDir, sanitizedFilename);
  fs.writeFileSync(fullPath, buffer);

  return {
    url: `/uploads/${folderType}/${sanitizedTarget}/${sanitizedFilename}`,
    storage: "local",
  };
}

// ==========================================
// SIGNED DOWNLOAD URLS (cached)
// ==========================================

// One download token per (bucket, top-level folder), valid 7 days and reused
// for 6, so serving a feed of N videos costs zero B2 API calls on a warm instance.
const DOWNLOAD_TOKEN_VALID_SECONDS = 7 * 24 * 60 * 60;
const DOWNLOAD_TOKEN_REUSE_MS = 6 * 24 * 60 * 60 * 1000;
const downloadTokenCache = new Map<string, { token: string | null; fetchedAt: number }>();

async function getDownloadToken(client: B2, bucketId: string, prefix: string): Promise<string | null> {
  const key = `${bucketId}:${prefix}`;
  const cached = downloadTokenCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < DOWNLOAD_TOKEN_REUSE_MS) return cached.token;

  let token: string | null = null;
  try {
    const res = await client.getDownloadAuthorization({
      bucketId,
      fileNamePrefix: prefix,
      validDurationInSeconds: DOWNLOAD_TOKEN_VALID_SECONDS,
    });
    token = res.data?.authorizationToken ?? null;
  } catch (err) {
    console.error("B2 getDownloadAuthorization failed:", err);
    return cached?.token ?? null; // keep serving the old token rather than none
  }
  if (downloadTokenCache.size > 5000) downloadTokenCache.clear(); // per-file tokens: keep memory bounded
  downloadTokenCache.set(key, { token, fetchedAt: Date.now() });
  return token;
}

/** Extracts the B2 file name from a stored URL (".../file/<bucket>/<name>" or "<publicUrl>/<name>"). */
export function b2FileNameFromUrl(url: string, publicUrl?: string): string | null {
  const clean = url.split("?")[0];
  const match = clean.match(/\/file\/[^/]+\/(.+)$/);
  if (match) return match[1];
  if (publicUrl) {
    const base = publicUrl.replace(/\/$/, "") + "/";
    if (clean.startsWith(base)) return clean.slice(base.length);
  }
  return null;
}

/** Token scope for a file: its top-level folder ("reels/"), or the file itself if at bucket root. */
function tokenPrefixFor(fileName: string): string {
  const slash = fileName.indexOf("/");
  return slash >= 0 ? fileName.slice(0, slash + 1) : fileName;
}

/**
 * Returns a function that turns stored video URLs into playable URLs.
 * Public buckets are returned as-is; private buckets get a download token
 * scoped to the file's top-level folder (never the whole bucket).
 * Pass the URLs you will sign so all B2 calls (normally none on a warm
 * instance, thanks to caching) happen up front; the returned function is sync.
 */
export async function getUrlSigner(
  folderType: FolderType,
  urls: string[],
  options: { scope?: "folder" | "file" } = {}
): Promise<(url: string) => string> {
  // "file" scope issues one token per file; use it whenever the links go to an
  // end user and the folder holds other users' files (e.g. payout receipts).
  const prefixFor = options.scope === "file" ? (name: string) => name : tokenPrefixFor;
  const identity = (url: string) => url;
  const config = await getB2ConfigForFolder(folderType);
  if (!config) return identity;

  try {
    const { client, downloadUrl } = await getB2Client(config.keyId, config.applicationKey);
    const { bucketName, bucketType } = await getBucketInfo(client, config.bucketId);
    if (bucketType === "allPublic") return identity;

    const prefixes = new Set<string>();
    for (const url of urls) {
      const fileName = url ? b2FileNameFromUrl(url, config.publicUrl) : null;
      if (fileName) prefixes.add(prefixFor(fileName));
    }
    const tokens = new Map<string, string | null>();
    await Promise.all(
      [...prefixes].map(async (prefix) => {
        tokens.set(prefix, await getDownloadToken(client, config.bucketId, prefix));
      })
    );

    return (url: string) => {
      if (!url) return url;
      const fileName = b2FileNameFromUrl(url, config.publicUrl);
      if (!fileName) return url;
      const token = tokens.get(prefixFor(fileName));
      const base = buildPublicUrl(config, fileName, downloadUrl, bucketName || undefined);
      return token ? `${base}?Authorization=${encodeURIComponent(token)}` : base;
    };
  } catch (err) {
    console.error(`Failed to prepare B2 URL signer for ${folderType}:`, err);
    return identity;
  }
}

// ==========================================
// STREAMED LARGE-FILE UPLOADS (one chunk = one B2 part)
// ==========================================

/** B2 requires every part except the last to be at least 5 MB. */
export const B2_MIN_PART_BYTES = 5_000_000;

async function requireConfig(folderType: FolderType): Promise<{ config: B2Config; client: B2; downloadUrl: string }> {
  const config = await getB2ConfigForFolder(folderType);
  if (!config) throw new Error(`No Backblaze B2 configuration found for bucket category: ${folderType}`);
  const { client, downloadUrl } = await getB2Client(config.keyId, config.applicationKey);
  return { config, client, downloadUrl };
}

export async function b2StartLargeFile(folderType: FolderType, b2FileName: string, mimeType?: string): Promise<string> {
  const { config, client } = await requireConfig(folderType);
  const res = await client.startLargeFile({
    bucketId: config.bucketId,
    fileName: b2FileName,
    contentType: mimeType || "application/octet-stream",
  });
  return res.data.fileId;
}

/** Uploads one part; returns its SHA-1 (needed to finish the file). */
export async function b2UploadPart(folderType: FolderType, fileId: string, partNumber: number, data: Buffer): Promise<string> {
  const { client } = await requireConfig(folderType);
  const urlRes = await client.getUploadPartUrl({ fileId });
  const res = await client.uploadPart({
    uploadUrl: urlRes.data.uploadUrl,
    uploadAuthToken: urlRes.data.authorizationToken,
    partNumber,
    data,
  });
  return res.data.contentSha1;
}

export async function b2FinishLargeFile(folderType: FolderType, fileId: string, partSha1Array: string[]): Promise<void> {
  const { client } = await requireConfig(folderType);
  await client.finishLargeFile({ fileId, partSha1Array });
}

export async function b2CancelLargeFile(folderType: FolderType, fileId: string): Promise<void> {
  const { client } = await requireConfig(folderType);
  await client.cancelLargeFile({ fileId });
}

/** Public (unsigned) URL for a file, as stored in the database. */
export async function b2PublicUrl(folderType: FolderType, b2FileName: string): Promise<string> {
  const { config, client, downloadUrl } = await requireConfig(folderType);
  const bucketName = await resolveBucketName(client, config.bucketId);
  return buildPublicUrl(config, b2FileName, downloadUrl, bucketName || undefined);
}

/** True if a file with exactly this name exists in the folder's bucket. */
export async function b2FileExists(folderType: FolderType, b2FileName: string): Promise<boolean> {
  const { config, client } = await requireConfig(folderType);
  const res = await client.listFileNames({ bucketId: config.bucketId, startFileName: b2FileName, maxFileCount: 1 });
  return res.data?.files?.[0]?.fileName === b2FileName;
}

// ==========================================
// DELETING FILES
// ==========================================

/**
 * Turns a stored media URL into a B2 file name in the folder's configured bucket.
 * Returns null for anything that isn't ours (external links, other buckets), so
 * we never delete by name in the wrong bucket.
 */
export async function resolveOwnedFileName(folderType: FolderType, url: string): Promise<string | null> {
  const config = await getB2ConfigForFolder(folderType);
  if (!config) return null;
  const clean = url.split("?")[0];

  const m = clean.match(/\/file\/([^/]+)\/(.+)$/);
  if (m) {
    const { client } = await getB2Client(config.keyId, config.applicationKey);
    const { bucketName } = await getBucketInfo(client, config.bucketId);
    const urlBucket = m[1];
    if (urlBucket !== bucketName && urlBucket !== config.bucketId) return null;
    return decodeURIComponent(m[2]);
  }
  if (config.publicUrl) {
    const base = config.publicUrl.replace(/\/$/, "") + "/";
    if (clean.startsWith(base)) return decodeURIComponent(clean.slice(base.length));
  }
  return null;
}

/** Deletes every stored version of a file. Returns how many versions were removed (0 = already gone). */
export async function b2DeleteFile(folderType: FolderType, fileName: string): Promise<number> {
  const { config, client } = await requireConfig(folderType);
  let deleted = 0;
  let startFileName: string | undefined = fileName;
  let startFileId: string | undefined;
  for (;;) {
    const res = await client.listFileVersions({
      bucketId: config.bucketId,
      startFileName,
      startFileId,
      maxFileCount: 100,
      prefix: fileName,
    });
    const versions = (res.data?.files || []).filter((f) => f.fileName === fileName);
    for (const v of versions) {
      await client.deleteFileVersion({ fileId: v.fileId, fileName: v.fileName });
      deleted++;
    }
    if (res.data?.nextFileName !== fileName || !res.data?.nextFileId) break;
    startFileName = res.data.nextFileName;
    startFileId = res.data.nextFileId;
  }
  return deleted;
}

/** Lists finished files under a prefix (used by the orphan scan). */
export async function b2ListFiles(
  folderType: FolderType,
  prefix: string
): Promise<{ fileName: string; size: number; uploadedAt: number }[]> {
  const { config, client } = await requireConfig(folderType);
  const out: { fileName: string; size: number; uploadedAt: number }[] = [];
  let startFileName: string | undefined;
  for (;;) {
    const res = await client.listFileNames({ bucketId: config.bucketId, prefix, startFileName, maxFileCount: 1000 });
    for (const f of res.data?.files || []) {
      out.push({ fileName: f.fileName, size: f.contentLength, uploadedAt: f.uploadTimestamp });
    }
    if (!res.data?.nextFileName) break;
    startFileName = res.data.nextFileName;
  }
  return out;
}
