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
  });

  return { client, downloadUrl };
}

/**
 * Lists every file name currently stored in the B2 bucket for a folder type.
 * Returns a Set of file names so callers can cheaply skip already-uploaded files.
 *
 * On any error (missing config, 401, insufficient permissions) this returns an
 * empty Set — callers should treat that as "unknown" and upload normally.
 */
export async function listB2FileNames(folderType: FolderType): Promise<Set<string>> {
  const names = new Set<string>();
  const config = await getB2ConfigForFolder(folderType);
  if (!config) return names;

  try {
    const { client } = await getB2Client(config.keyId, config.applicationKey);
    let startFileName = "";
    while (true) {
      const res = await client.listFileNames({
        bucketId: config.bucketId,
        startFileName,
        maxFileCount: 1000,
      });
      const files = (res.data?.files || []) as Array<{ fileName?: string }>;
      for (const f of files) {
        if (f.fileName) names.add(f.fileName);
      }
      const next = res.data?.nextFileName;
      if (!next) break;
      startFileName = next;
    }
  } catch (err) {
    console.error(`Failed to list existing B2 files for ${folderType}:`, err);
    return new Set<string>();
  }

  return names;
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

/**
 * Constructs the canonical public access URL for an uploaded file.
 */
/**
 * Resolves the bucket name from a bucket ID using the B2 client (server-side).
 */
export async function resolveBucketName(client: B2, bucketId: string): Promise<string | null> {
  try {
    const single = await client.getBucket({ bucketId });
    const b = single.data.buckets?.[0];
    if (b?.bucketName) return b.bucketName;
  } catch {
    // ignore
  }
  try {
    const list = await client.listBuckets();
    const buckets = (list.data?.buckets || []) as Array<{ bucketId?: string; bucketName?: string }>;
    const match = buckets.find((b) => b.bucketId === bucketId);
    if (match?.bucketName) return match.bucketName;
  } catch {
    // ignore
  }
  return null;
}

export async function buildAuthorizedPublicUrl(config: B2Config, b2FileName: string, downloadUrl?: string, bucketName?: string): Promise<string> {
  const url = buildPublicUrl(config, b2FileName, downloadUrl, bucketName);
  try {
    const { client } = await getB2Client(config.keyId, config.applicationKey);
    const authRes = await (client as any).getDownloadAuthorization({
      bucketId: config.bucketId,
      fileNamePrefix: b2FileName,
      validDurationInSeconds: 604800,
    });
    const token = authRes.data?.authorizationToken ?? authRes.data?.downloadAuthorization ?? null;
    if (token && typeof token === "string") {
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}Authorization=${encodeURIComponent(token)}`;
    }
  } catch {
    // fall back to unauthorized URL
  }
  return url;
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
