import { type FolderType, getB2AuthInfo, getB2ConfigForFolder, resolveBucketName } from "@/lib/b2";
import { presignS3Url, regionFromS3Endpoint } from "@/lib/s3Presign";

/**
 * Direct browser → Backblaze uploads.
 *
 * Hosts like Vercel reject request bodies over 4.5 MB, but Backblaze needs
 * upload parts of at least 5 MB, so video bytes can't go through our API.
 * Instead the server hands the browser short-lived upload targets that only
 * work for the one file being uploaded:
 * - multi-part files: a B2 "upload part URL" (b2_get_upload_part_url), whose
 *   token can only add parts to that one large file;
 * - single-part files (≤ 5 MB): an S3 presigned PUT URL for that exact file name.
 * Neither can touch any other file, so moderators still can't overwrite live reels.
 *
 * Browsers need a CORS rule on the bucket for this; ensureDirectUploads()
 * adds it automatically (keeping existing rules) when the Backblaze key is
 * allowed to change bucket settings.
 */

// Uploads are authorised by the per-file token/signature, not by the origin,
// so any origin is allowed (also covers preview deployments and localhost).
const RULE_NAME = "dramflix-direct-uploads";
const RULES = [
  {
    corsRuleName: `${RULE_NAME}-b2`,
    allowedOrigins: ["*"],
    allowedOperations: ["b2_upload_part"],
    allowedHeaders: ["authorization", "content-type", "x-bz-part-number", "x-bz-content-sha1"],
    maxAgeSeconds: 3600,
  },
  {
    corsRuleName: `${RULE_NAME}-s3`,
    allowedOrigins: ["*"],
    allowedOperations: ["s3_put"],
    allowedHeaders: ["content-type"],
    maxAgeSeconds: 3600,
  },
];

type Readiness = { ok: true } | { ok: false; reason: string };
const readiness = new Map<string, { at: number; value: Readiness }>();
const RETRY_FAILED_AFTER_MS = 10 * 60 * 1000;

async function b2Api<T>(apiUrl: string, token: string, op: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiUrl}/b2api/v2/${op}`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { code?: string; message?: string };
  if (!res.ok) {
    throw Object.assign(new Error(`${op}: ${data.message || data.code || res.status}`), { status: res.status, code: data.code });
  }
  return data;
}

/**
 * Makes sure the folder's bucket accepts direct uploads from browsers (adds
 * our CORS rule if missing). Cached per bucket; failures are retried after 10 minutes.
 */
export async function ensureDirectUploads(folderType: FolderType): Promise<Readiness> {
  const config = await getB2ConfigForFolder(folderType);
  if (!config) return { ok: false, reason: "Backblaze isn't configured for this folder." };
  const cached = readiness.get(config.bucketId);
  if (cached && (cached.value.ok || Date.now() - cached.at < RETRY_FAILED_AFTER_MS)) return cached.value;

  let value: Readiness;
  try {
    const auth = await getB2AuthInfo(config.keyId, config.applicationKey);
    if (!auth.s3ApiUrl) throw new Error("Backblaze didn't return an S3 endpoint for this key.");
    const list = await b2Api<{ buckets: { bucketId: string; corsRules?: unknown[]; revision?: number }[] }>(
      auth.apiUrl,
      auth.authorizationToken,
      "b2_list_buckets",
      { accountId: auth.accountId, bucketId: config.bucketId }
    );
    const bucket = list.buckets.find((b) => b.bucketId === config.bucketId);
    if (!bucket) throw new Error("Bucket not found for this key.");
    const rules = (bucket.corsRules ?? []) as { corsRuleName?: string }[];
    const missing = RULES.filter((want) => !rules.some((r) => r.corsRuleName === want.corsRuleName));
    if (missing.length) {
      if (!auth.capabilities.includes("writeBuckets")) {
        throw Object.assign(new Error("missing writeBuckets"), { code: "unauthorized" });
      }
      await b2Api(auth.apiUrl, auth.authorizationToken, "b2_update_bucket", {
        accountId: auth.accountId,
        bucketId: config.bucketId,
        corsRules: [...rules, ...missing],
        ifRevisionIs: bucket.revision,
      });
      console.info(`Direct uploads: added CORS rules to bucket ${config.bucketId}`);
    }
    value = { ok: true };
  } catch (err) {
    const code = (err as { code?: string }).code;
    value = {
      ok: false,
      reason:
        code === "unauthorized"
          ? `The Backblaze key for the ${folderType} bucket isn't allowed to change bucket settings, so the browser upload rule couldn't be added. Add the CORS rules from docs/direct-uploads.md, or use a key with the writeBuckets capability.`
          : `Couldn't prepare direct uploads: ${err instanceof Error ? err.message : String(err)}`,
    };
    console.warn("Direct uploads unavailable:", value.reason);
  }
  readiness.set(config.bucketId, { at: Date.now(), value });
  return value;
}

/** Upload target for one part of a large file (token works only for that file). */
export async function directPartTarget(
  folderType: FolderType,
  fileId: string
): Promise<{ kind: "b2-part"; uploadUrl: string; authorizationToken: string }> {
  const config = await getB2ConfigForFolder(folderType);
  if (!config) throw new Error("Backblaze isn't configured for this folder.");
  const { client } = await getB2AuthInfo(config.keyId, config.applicationKey);
  const res = await client.getUploadPartUrl({ fileId });
  return { kind: "b2-part", uploadUrl: res.data.uploadUrl, authorizationToken: res.data.authorizationToken };
}

/** Presigned PUT URL for one whole (small) file, valid for an hour. */
export async function directPutTarget(
  folderType: FolderType,
  b2FileName: string
): Promise<{ kind: "s3-put"; url: string }> {
  const config = await getB2ConfigForFolder(folderType);
  if (!config) throw new Error("Backblaze isn't configured for this folder.");
  const auth = await getB2AuthInfo(config.keyId, config.applicationKey);
  if (!auth.s3ApiUrl) throw new Error("Backblaze didn't return an S3 endpoint for this key.");
  const bucketName = await resolveBucketName(auth.client, config.bucketId);
  if (!bucketName) throw new Error("Couldn't resolve the bucket name.");
  const url = presignS3Url({
    method: "PUT",
    endpoint: auth.s3ApiUrl,
    path: `/${bucketName}/${b2FileName}`,
    region: regionFromS3Endpoint(auth.s3ApiUrl),
    accessKeyId: config.keyId,
    secretAccessKey: config.applicationKey,
    expiresSeconds: 3600,
  });
  return { kind: "s3-put", url };
}
