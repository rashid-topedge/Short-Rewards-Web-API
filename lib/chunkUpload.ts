"use client";

/**
 * Browser helper for the admin chunked-upload API (/api/admin/upload-chunk/*).
 * Each chunk is streamed by the server straight to Backblaze B2.
 *
 * - Reports byte-level progress.
 * - Retries each chunk a few times on network errors.
 * - Can be resumed: pass the `sessionId` from a previous failed attempt and only
 *   the missing chunks are sent.
 */

export type ChunkFolderType = "dramas" | "reels" | "payouts";

export const CHUNK_SIZE = 5 * 1024 * 1024;
const CHUNK_RETRIES = 3;

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

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error || data.message || fallback;
  } catch {
    return fallback;
  }
}

function sendChunk(
  sessionId: string,
  index: number,
  blob: Blob,
  signal: AbortSignal | undefined,
  onChunkProgress: (loaded: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("sessionId", sessionId);
    form.append("chunkIndex", String(index));
    form.append("chunk", blob, `chunk_${index}.part`);

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onChunkProgress(Math.min(e.loaded, blob.size));
    };
    xhr.onload = () => {
      signal?.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let message = `Chunk ${index + 1} failed (HTTP ${xhr.status})`;
        try {
          const data = JSON.parse(xhr.responseText) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          // keep default message
        }
        reject(Object.assign(new Error(message), { status: xhr.status }));
      }
    };
    xhr.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Network error while uploading"));
    };
    xhr.onabort = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new UploadAbortedError());
    };

    xhr.open("POST", "/api/admin/upload-chunk/part", true);
    xhr.send(form);
  });
}

export async function uploadFileChunked(file: File, options: ChunkUploadOptions): Promise<ChunkUploadResult> {
  const { signal } = options;
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  let sessionId = options.sessionId;
  let done = new Set<number>();

  if (sessionId) {
    const res = await fetch(`/api/admin/upload-chunk/status?sessionId=${encodeURIComponent(sessionId)}`, { signal });
    if (res.ok) {
      const data = (await res.json()) as { uploadedChunks?: number[] };
      done = new Set(data.uploadedChunks || []);
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
        mimeType: file.type || "application/octet-stream",
        uniqueName: options.uniqueName === true,
      }),
    });
    if (!res.ok) throw new Error(await readError(res, "Could not start the upload"));
    const data = (await res.json()) as { sessionId: string };
    sessionId = data.sessionId;
    options.onSession?.(sessionId);
  }

  const chunkBytes = (i: number) => Math.min(CHUNK_SIZE, file.size - i * CHUNK_SIZE);
  let completedBytes = 0;
  done.forEach((i) => (completedBytes += chunkBytes(i)));
  options.onProgress?.(completedBytes, file.size);

  for (let i = 0; i < totalChunks; i++) {
    if (done.has(i)) continue;
    if (signal?.aborted) throw new UploadAbortedError();

    const blob = file.slice(i * CHUNK_SIZE, i * CHUNK_SIZE + chunkBytes(i));
    for (let attempt = 1; ; attempt++) {
      try {
        await sendChunk(sessionId, i, blob, signal, (loaded) =>
          options.onProgress?.(completedBytes + loaded, file.size)
        );
        break;
      } catch (err) {
        const status = (err as { status?: number }).status;
        const retryable = !(err instanceof UploadAbortedError) && (status === undefined || status >= 500);
        if (!retryable || attempt >= CHUNK_RETRIES) throw err;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
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
