/**
 * File names in Backblaze: keep the uploaded file's own name (cleaned so it
 * works in a URL), and add -2, -3… only when that name is already taken, so
 * nothing is ever overwritten.
 */

/** Characters kept as they are; anything else becomes "-". */
const UNSAFE = /[^A-Za-z0-9._-]+/g;

/** "My Clip (1).MP4" → "My-Clip-1.MP4"; "ڈرامہ.mp4" → "video.mp4" (no usable letters). */
export function cleanFileName(name: string, fallback = "file"): string {
  const base = (name.split(/[\\/]/).pop() || "").trim();
  const dot = base.lastIndexOf(".");
  let stem = dot > 0 ? base.slice(0, dot) : base;
  let ext = dot > 0 ? base.slice(dot + 1) : "";
  stem = stem
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // é → e
    .replace(UNSAFE, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, 120)
    .replace(/[-._]+$/g, "");
  ext = ext.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
  return `${stem || fallback}${ext ? `.${ext}` : ""}`;
}

/** "clip.mp4", 2 → "clip-2.mp4". */
export function numberedName(fileName: string, n: number | string): string {
  if (n === 1 || n === "1") return fileName;
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? `${fileName.slice(0, dot)}-${n}${fileName.slice(dot)}` : `${fileName}-${n}`;
}

/**
 * First free "<dir>/<name>", "<dir>/<name-2>", … `claim` returns true when it
 * reserved the name (it should check both storage and other uploads in progress).
 */
export async function claimFreeName(
  dir: string,
  fileName: string,
  claim: (fullName: string) => Promise<boolean>,
  maxTries = 30
): Promise<string> {
  const prefix = dir ? `${dir.replace(/\/+$/, "")}/` : "";
  for (let n = 1; n <= maxTries; n++) {
    const full = prefix + numberedName(fileName, n);
    if (await claim(full)) return full;
  }
  // Very unlikely: fall back to a random suffix.
  for (;;) {
    const full = prefix + numberedName(fileName, Math.random().toString(36).slice(2, 8));
    if (await claim(full)) return full;
  }
}

/** Folder slug from a title: "Love & War (2026)" → "love-war-2026". */
export function slugify(text: string | null | undefined, max = 60): string {
  return (text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** Each drama's own folder in the bucket: "dramas/<id>-<title-slug>". */
export function dramaFolderName(dramaId: number, title: string | null | undefined): string {
  const slug = slugify(title);
  return slug ? `${dramaId}-${slug}` : String(dramaId);
}
