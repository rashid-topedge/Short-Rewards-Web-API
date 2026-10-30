"use client";

/**
 * Browser helper for the admin chunked-upload API (/api/admin/upload-chunk/*).
 *
 * Bytes go straight from the browser to Backblaze B2 when the server says the
 * bucket allows it ("direct" mode): hosts like Vercel reject request bodies
 * over 4.5 MB, and B2 needs 5 MB parts. Otherwise each chunk is sent to our
 * API, which forwards it to B2 ("server" mode). If direct upload is blocked
 * in this browser, it switches to server mode automatically.
 *
 * - Reports byte-level progress.
 * - Retries each chunk a few times on network errors.
 * - Can be resumed: pass the `sessionId` from a previous failed attempt and only
 *   the missing chunks are sent.
 */

export type ChunkFolderType = "dramas" | "reels" | "payouts";

export const CHUNK_SIZE = 5 * 1024 * 1024;
const CHUNK_RETRIES = 4;

export type ChunkUploadOptions = {
  folderType: ChunkFolderType;
  targetName?: string;
  /** Prefix the stored file name so uploads never overwrite each other. */
  uniqueName?: boolean;
  /** For reels: false = don't auto-create a reel row on completion. */
  createReel?: boolean;
  /** Resume an earlier attempt. */
  sessionId?: string;
  signal?: AbortSignal;
  onSession?: (sessionId: string) => void;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
};

export type ChunkUploadResult = {
  url: string;
  durationSeconds: number | null;
  sessionId: string;
};

export class UploadAbortedError extends Error {
  constructor() {
    super("Upload cancelled");
  }
}

type UploadMode = "direct" | "server";
type DirectTarget = { kind: "b2-part"; uploadUrl: string; authorizationToken: string } | { kind: "s3-put"; url: string };

class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error || data.message || fallback;
  } catch {
    return fallback;
  }
}

/** XHR (for upload progress). Resolves with status + body; rejects only on network error/abort. */
function xhrSend(opts: {
  method: string;
  url: string;
  body: Blob | FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onProgress?: (loaded: number) => void;
}): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const done = () => opts.signal?.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded);
    };
    xhr.onload = () => {
      done();
      resolve({ status: xhr.status, text: xhr.responseText });
    };
    xhr.onerror = () => {
      done();
      reject(new HttpError("Network error while uploading", 0));
    };
    xhr.onabort = () => {
      done();
      reject(new UploadAbortedError());
    };
    xhr.open(opts.method, opts.url, true);
    for (const [k, v] of Object.entries(opts.headers ?? {})) xhr.setRequestHeader(k, v);
    xhr.send(opts.body);
  });
}

function messageFrom(text: string, fallback: string): string {
  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    return data.error || data.message || fallback;
  } catch {
    return fallback;
  }
}

async function sha1Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Server mode: send the chunk to our API, which forwards it to B2. */
async function sendViaServer(
  sessionId: string,
  index: number,
  blob: Blob,
  signal: AbortSignal | undefined,
  onProgress: (loaded: number) => void,
  directProblem: string | null
): Promise<void> {
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("chunkIndex", String(index));
  form.append("chunk", blob, `chunk_${index}.part`);
  const res = await xhrSend({ method: "POST", url: "/api/admin/upload-chunk/part", body: form, signal, onProgress });
  if (res.status >= 200 && res.status < 300) return;
  if (res.status === 413) {
    throw new HttpError(
      "This server's hosting doesn't accept uploads this large through the app (HTTP 413), and direct uploads to Backblaze aren't available" +
        (directProblem ? `: ${directProblem.replace(/\.?$/, ".")}` : ".") +
        " See docs/direct-uploads.md.",
      413
    );
  }
  throw new HttpError(messageFrom(res.text, `Chunk ${index + 1} failed (HTTP ${res.status})`), res.status);
}

async function fetchTarget(sessionId: string, signal?: AbortSignal): Promise<DirectTarget> {
  const res = await fetch("/api/admin/upload-chunk/target", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new HttpError(await readError(res, "Couldn't prepare the upload"), res.status);
  return (await res.json()) as DirectTarget;
}

/** Direct mode: send the chunk straight to Backblaze, then tell our API it arrived. */
async function sendDirect(
  sessionId: string,
  index: number,
  blob: Blob,
  target: DirectTarget,
  contentType: string,
  signal: AbortSignal | undefined,
  onProgress: (loaded: number) => void
): Promise<void> {
  let sha1: string | undefined;
  let res: { status: number; text: string };
  if (target.kind === "b2-part") {
    sha1 = await sha1Hex(blob);
    res = await xhrSend({
      method: "POST",
      url: target.uploadUrl,
      body: blob,
      headers: {
        Authorization: target.authorizationToken,
        "X-Bz-Part-Number": String(index + 1),
        "X-Bz-Content-Sha1": sha1,
      },
      signal,
      onProgress,
    });
  } else {
    res = await xhrSend({ method: "PUT", url: target.url, body: blob, headers: { "Content-Type": contentType }, signal, onProgress });
  }
  if (res.status < 200 || res.status >= 300) {
    throw new HttpError(messageFrom(res.text, `Backblaze rejected part ${index + 1} (HTTP ${res.status})`), res.status);
  }

  const report = await fetch("/api/admin/upload-chunk/part", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ sessionId, chunkIndex: index, sha1 }),
  });
  if (!report.ok) throw new HttpError(await readError(report, `Chunk ${index + 1} couldn't be recorded`), report.status);
}

/**
 * Sends one session's chunks, directly to Backblaze when possible, otherwise
 * through our API. Handles retries, expired upload URLs and the automatic
 * fallback. Send chunks one at a time, in order.
 */
export class ChunkSender {
  private target: DirectTarget | null = null;
  private directWorked = false;

  constructor(
    private sessionId: string,
    private contentType: string,
    private mode: UploadMode,
    private directProblem: string | null,
    private signal?: AbortSignal
  ) {}

  /** Builds a sender from an init/status response body. */
  static fromServer(
    sessionId: string,
    contentType: string,
    data: { uploadMode?: string; directProblem?: string | null },
    signal?: AbortSignal
  ): ChunkSender {
    return new ChunkSender(sessionId, contentType, data.uploadMode === "direct" ? "direct" : "server", data.directProblem ?? null, signal);
  }

  /** `signal` overrides the one given to the constructor (e.g. per-chunk pause). */
  async send(index: number, blob: Blob, onProgress: (loaded: number) => void, signal = this.signal): Promise<void> {
    const progress = (loaded: number) => onProgress(Math.min(loaded, blob.size));
    for (let attempt = 1; ; attempt++) {
      if (signal?.aborted) throw new UploadAbortedError();
      try {
        if (this.mode === "direct") {
          this.target ??= await fetchTarget(this.sessionId, signal);
          await sendDirect(this.sessionId, index, blob, this.target, this.contentType, signal, progress);
          this.directWorked = true;
        } else {
          await sendViaServer(this.sessionId, index, blob, signal, progress, this.directProblem);
        }
        return;
      } catch (err) {
        if (err instanceof UploadAbortedError || (err as { name?: string }).name === "AbortError") {
          throw new UploadAbortedError();
        }
        const status = err instanceof HttpError ? err.status : 0;

        if (this.mode === "direct") {
          // Blocked before anything got through (e.g. the bucket's CORS rule is
          // missing, or Backblaze refused the target): use the server instead.
          if (!this.directWorked && attempt === 1 && (status === 0 || status === 403 || status === 409)) {
            this.directProblem = err instanceof Error ? err.message : String(err);
            console.warn("Direct upload to Backblaze failed; sending through the server instead:", this.directProblem);
            this.mode = "server";
            attempt = 0;
            continue;
          }
          // Expired/used-up upload URL, or Backblaze busy: get a fresh target and retry.
          if (status === 0 || status === 401 || status === 403 || status === 408 || status === 429 || status >= 500) {
            this.target = null;
          } else {
            throw err;
          }
        } else if (status !== 0 && status < 500) {
          throw err;
        }

        if (attempt >= CHUNK_RETRIES) throw err;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
}

export async function uploadFileChunked(file: File, options: ChunkUploadOptions): Promise<ChunkUploadResult> {
  const { signal } = options;
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  const contentType = file.type || "application/octet-stream";
  let sessionId = options.sessionId;
  let done = new Set<number>();
  let modeInfo: { uploadMode?: string; directProblem?: string | null } = {};

  if (sessionId) {
    const res = await fetch(`/api/admin/upload-chunk/status?sessionId=${encodeURIComponent(sessionId)}`, { signal });
    if (res.ok) {
      const data = (await res.json()) as { uploadedChunks?: number[]; uploadMode?: string; directProblem?: string | null };
      done = new Set(data.uploadedChunks || []);
      modeInfo = data;
    } else {
      sessionId = undefined; // expired or finished: start over
    }
  }

  if (!sessionId) {
    const res = await fetch("/api/admin/upload-chunk/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        folderType: options.folderType,
        targetName: options.targetName,
        totalChunks,
        chunkSize: CHUNK_SIZE,
        mimeType: contentType,
        uniqueName: options.uniqueName === true,
      }),
    });
    if (!res.ok) throw new Error(await readError(res, "Could not start the upload"));
    const data = (await res.json()) as { sessionId: string; uploadMode?: string; directProblem?: string | null };
    sessionId = data.sessionId;
    modeInfo = data;
    options.onSession?.(sessionId);
  }

  const chunkBytes = (i: number) => Math.min(CHUNK_SIZE, file.size - i * CHUNK_SIZE);
  let completedBytes = 0;
  done.forEach((i) => (completedBytes += chunkBytes(i)));
  options.onProgress?.(completedBytes, file.size);

  const sender = ChunkSender.fromServer(sessionId, contentType, modeInfo, signal);
  for (let i = 0; i < totalChunks; i++) {
    if (done.has(i)) continue;
    const blob = file.slice(i * CHUNK_SIZE, i * CHUNK_SIZE + chunkBytes(i));
    await sender.send(i, blob, (loaded) => options.onProgress?.(completedBytes + loaded, file.size));
    completedBytes += chunkBytes(i);
    options.onProgress?.(completedBytes, file.size);
  }

  const res = await fetch("/api/admin/upload-chunk/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ sessionId, createReel: options.createReel }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not finish the upload"));
  const data = (await res.json()) as { url: string; durationSeconds?: number | null };
  return { url: data.url, durationSeconds: data.durationSeconds ?? null, sessionId };
}

/** Best-effort cancel of a server-side session (frees B2 parts). */
export function cancelChunkSession(sessionId: string): void {
  fetch("/api/admin/upload-chunk/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {});
}

/** Reads a local video's duration and grabs a poster frame, without uploading anything. */
export async function inspectVideo(file: File): Promise<{ durationSeconds: number | null; poster: Blob | null }> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Unreadable video"));
      setTimeout(() => reject(new Error("Timed out reading video")), 15000);
    });

    const durationSeconds = Number.isFinite(video.duration) ? Math.round(video.duration) : null;

    // Seek a little in to avoid black first frames.
    const target = Math.min(1, (video.duration || 2) / 4);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = target;
      setTimeout(resolve, 5000);
    });

    let poster: Blob | null = null;
    if (video.videoWidth && video.videoHeight) {
      const scale = Math.min(1, 720 / video.videoHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      poster = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    }
    return { durationSeconds, poster };
  } catch {
    return { durationSeconds: null, poster: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Untitled reel";
}
