import crypto from "node:crypto";

/**
 * Minimal AWS Signature V4 query-string presigning (works with Backblaze B2's
 * S3-compatible API). Used to give the browser a short-lived URL that can PUT
 * exactly one object, so the file bytes never pass through our server.
 */

/** RFC 3986 encoding, as SigV4 requires. */
export function s3Encode(value: string, keepSlash = false): string {
  const encoded = encodeURIComponent(value).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return keepSlash ? encoded.replace(/%2F/g, "/") : encoded;
}

function hmac(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export type PresignOptions = {
  method: "GET" | "PUT";
  /** e.g. https://s3.us-west-004.backblazeb2.com */
  endpoint: string;
  /** Already-unencoded object path, e.g. "/my-bucket/reels/clip.mp4". */
  path: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSeconds: number;
  /** Extra query parameters to sign (e.g. partNumber, uploadId). */
  query?: Record<string, string>;
  /** For tests: fixed signing time. */
  now?: Date;
};

export function presignS3Url(o: PresignOptions): string {
  const url = new URL(o.endpoint);
  const host = url.host;
  const now = o.now ?? new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${o.region}/s3/aws4_request`;

  const params: Record<string, string> = {
    ...(o.query ?? {}),
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${o.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(o.expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${s3Encode(k)}=${s3Encode(params[k])}`)
    .join("&");
  const canonicalPath = s3Encode(o.path, true);

  const canonicalRequest = [o.method, canonicalPath, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${o.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, o.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  return `${url.protocol}//${host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** "https://s3.us-west-004.backblazeb2.com" → "us-west-004" */
export function regionFromS3Endpoint(endpoint: string): string {
  const host = endpoint.replace(/^https?:\/\//, "").split("/")[0];
  const m = host.match(/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i);
  return m ? m[1] : "us-east-1";
}
