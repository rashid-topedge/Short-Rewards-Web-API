import {
  b2DeleteFile,
  describeB2Error,
  getB2AuthInfo,
  getB2ConfigForFolder,
  getBucketDetails,
  getUrlSigner,
  uploadBufferToB2,
  type FolderType,
} from "@/lib/b2";
import { ensureDirectUploads } from "@/lib/b2Direct";

export type CheckStep = { step: string; ok: boolean; detail: string; warning?: boolean };

/** A 1×1 PNG: the smallest real image, so the check exercises the same path as a receipt or thumbnail. */
const TEST_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/** Capabilities the app's features need from a bucket's application key. */
const NEEDED: { cap: string; why: string }[] = [
  { cap: "writeFiles", why: "upload files" },
  { cap: "shareFiles", why: "make signed links for a private bucket (the app can't show files without them)" },
  { cap: "readFiles", why: "check uploads and serve files" },
  { cap: "listFiles", why: "check names and find unused files" },
  { cap: "deleteFiles", why: "remove replaced and deleted files" },
];

/**
 * Runs the real path once against the configured bucket: upload a tiny image,
 * make the link the app would get, download it through that link, check that
 * an unsigned link is refused (private bucket), check direct uploads, and
 * delete the test file. Each step reports what it found.
 */
export async function runStorageCheck(folderType: FolderType): Promise<{ ok: boolean; steps: CheckStep[] }> {
  const steps: CheckStep[] = [];
  const add = (step: string, ok: boolean, detail: string, warning = false) => {
    steps.push({ step, ok, detail, warning });
    return ok;
  };
  const done = () => ({ ok: steps.every((s) => s.ok || s.warning), steps });

  // 1. Settings
  const config = await getB2ConfigForFolder(folderType);
  if (!add("Settings", !!config, config ? `Key ${config.keyId.slice(0, 6)}…, bucket ${config.bucketId}` : `No Backblaze key / bucket set for ${folderType} (or the general S3 settings).`)) {
    return done();
  }

  // 2. Key and permissions
  let auth;
  try {
    auth = await getB2AuthInfo(config!.keyId, config!.applicationKey);
  } catch (err) {
    add("Key", false, `The key was refused: ${describeB2Error(err)}`);
    return done();
  }
  const missing = NEEDED.filter((n) => !auth.capabilities.includes(n.cap));
  add(
    "Key permissions",
    missing.length === 0,
    missing.length
      ? `Missing: ${missing.map((m) => `${m.cap} (to ${m.why})`).join("; ")}. Create a key with these permissions in Backblaze.`
      : `Has ${NEEDED.map((n) => n.cap).join(", ")}.`
  );

  // 3. Bucket
  const bucket = await getBucketDetails(auth.client, config!.bucketId, { fresh: true }).catch(() => ({ bucketName: null, bucketType: null }));
  if (!add("Bucket", !!bucket.bucketName, bucket.bucketName ? `"${bucket.bucketName}" (${bucket.bucketType})` : `Bucket ${config!.bucketId} not found for this key.`)) {
    return done();
  }
  const isPrivate = bucket.bucketType !== "allPublic";
  if (!isPrivate) {
    add(
      "Privacy",
      folderType !== "payouts",
      folderType === "payouts"
        ? "This bucket is PUBLIC: anyone with a link can open payout receipts (they show account details). Make it private in Backblaze."
        : "This bucket is public: links work without signing.",
      folderType !== "payouts"
    );
  }

  // 4. Upload
  const fileName = `${folderType}/_storage-check/check-${Date.now()}.png`;
  let url: string;
  try {
    url = (await uploadBufferToB2({ folderType, b2FileName: fileName, buffer: TEST_PNG, mimeType: "image/png" })).url;
    add("Upload", true, `Uploaded ${fileName}`);
  } catch (err) {
    add("Upload", false, `Upload failed: ${describeB2Error(err)}`);
    return done();
  }

  // 5. The link the app gets, and downloading through it
  try {
    const sign = await getUrlSigner(folderType, [url], { scope: folderType === "payouts" ? "file" : "folder" });
    const signed = sign(url);
    if (isPrivate && !signed.includes("Authorization=")) {
      add("Signed link", false, "Couldn't make a signed link (the key needs the shareFiles permission). The app would get a link that doesn't open.");
    } else {
      const res = await fetch(signed, { cache: "no-store" });
      const body = res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
      const same = !!body && body.length === TEST_PNG.length && body.every((b, i) => b === TEST_PNG[i]);
      add(
        "Signed link",
        same,
        same
          ? "The link the app gets downloads the image correctly."
          : `Downloading through the link failed (HTTP ${res.status}).${config!.publicUrl ? " Check the Public URL setting: it must serve this bucket." : ""}`
      );
    }
    if (isPrivate) {
      const plain = await fetch(url, { cache: "no-store" });
      add(
        "Private",
        plain.status === 401 || plain.status === 403,
        plain.status === 401 || plain.status === 403
          ? "Without the signed link the file is refused, as it should be."
          : `An unsigned link answered HTTP ${plain.status}; files may be readable without signing.`,
        !(plain.status === 401 || plain.status === 403) && folderType !== "payouts"
      );
    }
  } catch (err) {
    add("Signed link", false, `Couldn't download the test file: ${describeB2Error(err)}`);
  }

  // 6. Direct uploads from the browser (needed on Vercel for files over 4.5 MB)
  try {
    const direct = await ensureDirectUploads(folderType);
    add(
      "Direct uploads",
      direct.ok,
      direct.ok ? "Browsers can upload straight to this bucket." : `Not available: ${direct.reason}. Large files will fail on Vercel (over 4.5 MB).`,
      !direct.ok && folderType === "payouts" // receipts are small, so this is only a warning for payouts
    );
  } catch (err) {
    add("Direct uploads", false, describeB2Error(err), folderType === "payouts");
  }

  // 7. Clean up
  try {
    await b2DeleteFile(folderType, fileName);
    add("Clean up", true, "Test file deleted.");
  } catch (err) {
    add("Clean up", false, `Couldn't delete the test file (${fileName}): ${describeB2Error(err)}`, true);
  }

  return done();
}
