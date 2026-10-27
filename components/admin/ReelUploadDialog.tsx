"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ImagePlus,
  Loader2,
  RotateCcw,
  Trash2,
  UploadCloud,
  Video,
  X,
} from "lucide-react";
import DramaPicker, { type DramaRef } from "@/components/admin/DramaPicker";
import {
  cancelChunkSession,
  formatBytes,
  inspectVideo,
  titleFromFileName,
  uploadFileChunked,
  UploadAbortedError,
} from "@/lib/chunkUpload";

const MAX_FILES = 200;
const PARALLEL_UPLOADS = 2;
const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv";

type UploadState =
  | { status: "queued" }
  | { status: "uploading"; progress: number }
  | { status: "uploaded"; url: string; serverDuration: number | null }
  | { status: "failed"; error: string };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; reelId: number }
  | { status: "error"; error: string };

type ReelDraft = {
  key: string;
  file: File;
  sessionId?: string;
  upload: UploadState;
  save: SaveState;
  /** Save automatically as soon as the upload finishes. */
  saveRequested: boolean;
  durationSeconds: number | null;
  /** True once we've tried to read duration/poster locally (success or not). */
  inspected: boolean;
  posterBlob: Blob | null;
  customThumb: File | null;
  thumbPreview: string | null;
  // Metadata the admin edits
  title: string;
  synopsis: string;
  tags: string;
  drama: DramaRef | null;
  episodeNumber: string;
  isPublished: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after one or more reels were saved, so the list can refresh. */
  onSaved: () => void;
};

let keySeq = 0;

export default function ReelUploadDialog({ open, onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const itemsRef = useRef<ReelDraft[]>([]);
  const savedSomething = useRef(false);
  const headingId = useId();
  const [items, setItems] = useState<ReelDraft[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  // Batch defaults
  const [batchTags, setBatchTags] = useState("");
  const [batchDescription, setBatchDescription] = useState("");
  const [batchDrama, setBatchDrama] = useState<DramaRef | null>(null);
  const [batchPublished, setBatchPublished] = useState(true);

  itemsRef.current = items;

  const patch = useCallback((key: string, update: Partial<ReelDraft> | ((d: ReelDraft) => Partial<ReelDraft>)) => {
    setItems((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...(typeof update === "function" ? update(d) : update) } : d))
    );
  }, []);

  const announce = (msg: string) => setAnnouncement(msg);

  // ---- open / close the native modal dialog (gives focus trap + Esc for free)
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      savedSomething.current = false;
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  const busy = items.some(
    (d) => d.upload.status === "uploading" || d.upload.status === "queued" || d.save.status === "saving"
  );
  const unsaved = items.filter((d) => d.save.status !== "saved").length;

  const requestClose = () => {
    if (unsaved > 0) {
      const msg = busy
        ? "Uploads are still running. Close anyway? Unfinished uploads will be cancelled."
        : `${unsaved} video(s) haven't been saved as reels yet. Close anyway?`;
      if (!window.confirm(msg)) return;
    }
    // Cancel anything still in flight and free server-side sessions.
    for (const d of itemsRef.current) {
      controllers.current.get(d.key)?.abort();
      if (d.sessionId && d.upload.status !== "uploaded") cancelChunkSession(d.sessionId);
      if (d.thumbPreview) URL.revokeObjectURL(d.thumbPreview);
    }
    controllers.current.clear();
    setItems([]);
    setRejected([]);
    if (savedSomething.current) onSaved();
    onClose();
  };

  // ---- adding files
  const addFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList) return;
    const files = Array.from(fileList);
    const bad: string[] = [];
    const accepted: File[] = [];
    for (const f of files) {
      const isVideo = f.type.startsWith("video/") || /\.(mp4|webm|mov|mkv)$/i.test(f.name);
      if (!isVideo) bad.push(`${f.name} is not a video`);
      else if (itemsRef.current.length + accepted.length >= MAX_FILES) bad.push(`${f.name}: limit is ${MAX_FILES} videos per batch`);
      else accepted.push(f);
    }
    setRejected(bad);
    if (accepted.length === 0) return;

    const drafts: ReelDraft[] = accepted.map((file) => ({
      key: `reel-${++keySeq}`,
      file,
      upload: { status: "queued" },
      save: { status: "idle" },
      saveRequested: false,
      durationSeconds: null,
      inspected: false,
      posterBlob: null,
      customThumb: null,
      thumbPreview: null,
      title: titleFromFileName(file.name),
      synopsis: batchDescription,
      tags: batchTags,
      drama: batchDrama,
      episodeNumber: "",
      isPublished: batchPublished,
    }));
    setItems((prev) => [...prev, ...drafts]);
    announce(`${drafts.length} video${drafts.length === 1 ? "" : "s"} added. Uploading started.`);

    // Read duration and grab a poster frame locally, one at a time.
    for (const d of drafts) {
      const info = await inspectVideo(d.file);
      const still = itemsRef.current.find((x) => x.key === d.key);
      if (!still) continue;
      patch(d.key, (cur) => ({
        durationSeconds: info.durationSeconds,
        inspected: true,
        posterBlob: info.poster,
        thumbPreview: cur.customThumb ? cur.thumbPreview : info.poster ? URL.createObjectURL(info.poster) : null,
      }));
    }
  };

  // ---- upload queue (runs up to PARALLEL_UPLOADS at once)
  const startUpload = useCallback(
    async (d: ReelDraft) => {
      const controller = new AbortController();
      controllers.current.set(d.key, controller);
      patch(d.key, { upload: { status: "uploading", progress: 0 } });
      try {
        const result = await uploadFileChunked(d.file, {
          folderType: "reels",
          uniqueName: true,
          createReel: false,
          sessionId: d.sessionId,
          signal: controller.signal,
          onSession: (sessionId) => patch(d.key, { sessionId }),
          onProgress: (done, total) =>
            patch(d.key, { upload: { status: "uploading", progress: total ? done / total : 1 } }),
        });
        patch(d.key, { upload: { status: "uploaded", url: result.url, serverDuration: result.durationSeconds } });
        announce(`${d.file.name} uploaded.`);
      } catch (err) {
        if (err instanceof UploadAbortedError) return;
        const message = err instanceof Error ? err.message : String(err);
        patch(d.key, { upload: { status: "failed", error: message } });
        announce(`Upload failed for ${d.file.name}: ${message}`);
      } finally {
        controllers.current.delete(d.key);
      }
    },
    [patch]
  );

  useEffect(() => {
    const running = items.filter((d) => d.upload.status === "uploading").length;
    const queued = items.filter((d) => d.upload.status === "queued" && !controllers.current.has(d.key));
    queued.slice(0, Math.max(0, PARALLEL_UPLOADS - running)).forEach((d) => {
      controllers.current.set(d.key, new AbortController()); // reserve the slot
      void startUpload(d);
    });
  }, [items, startUpload]);

  // ---- saving reels
  const uploadThumbnail = async (d: ReelDraft): Promise<string | null> => {
    const source =
      d.customThumb ??
      (d.posterBlob
        ? new File([d.posterBlob], `${d.file.name.replace(/\.[^.]+$/, "")}_poster.jpg`, { type: "image/jpeg" })
        : null);
    if (!source) return null;
    const result = await uploadFileChunked(source, { folderType: "reels", uniqueName: true, createReel: false });
    return result.url;
  };

  const saveReel = useCallback(
    async (key: string) => {
      const d = itemsRef.current.find((x) => x.key === key);
      if (!d || d.upload.status !== "uploaded" || d.save.status === "saving" || d.save.status === "saved") return;
      if (!d.title.trim()) {
        patch(key, { save: { status: "error", error: "Title is required" }, saveRequested: false });
        return;
      }
      patch(key, { save: { status: "saving" }, saveRequested: false });
      try {
        const thumbnailUrl = await uploadThumbnail(d);
        const res = await fetch("/api/admin/reels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: d.title.trim(),
            synopsis: d.synopsis.trim(),
            videoUrl: d.upload.url,
            thumbnailUrl: thumbnailUrl ?? "",
            durationSeconds: d.durationSeconds ?? d.upload.serverDuration ?? 0,
            dramaId: d.drama?.dramaId ?? null,
            episodeNumber: d.episodeNumber ? Number(d.episodeNumber) : null,
            tags: d.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            isPublished: d.isPublished,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { reelId?: number; error?: string };
        if (!res.ok || !data.reelId) throw new Error(data.error || "Could not save the reel");
        savedSomething.current = true;
        patch(key, { save: { status: "saved", reelId: data.reelId } });
        announce(`Reel "${d.title.trim()}" saved${d.isPublished ? " and published" : " as draft"}.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        patch(key, { save: { status: "error", error: message } });
        announce(`Could not save "${d.title}": ${message}`);
      }
    },
    [patch]
  );

  // Save items whose upload finished after the admin already clicked Save.
  useEffect(() => {
    items
      .filter((d) => d.saveRequested && d.upload.status === "uploaded" && d.save.status !== "saving")
      .forEach((d) => void saveReel(d.key));
  }, [items, saveReel]);

  const requestSave = (key: string) => {
    const d = itemsRef.current.find((x) => x.key === key);
    if (!d) return;
    if (d.upload.status === "uploaded") void saveReel(key);
    else patch(key, { saveRequested: true, save: { status: "idle" } });
  };

  const saveAll = () => {
    for (const d of itemsRef.current) {
      if (d.save.status !== "saved" && d.upload.status !== "failed") requestSave(d.key);
    }
  };

  const applyBatchDefaults = () => {
    const sharedDescription = batchDescription.trim();
    let replaceTypedDescriptions = true;
    if (sharedDescription) {
      // Don't silently wipe descriptions the admin already wrote for individual videos.
      const custom = itemsRef.current.filter(
        (d) => d.save.status !== "saved" && d.synopsis.trim() && d.synopsis.trim() !== sharedDescription
      ).length;
      if (custom > 0) {
        replaceTypedDescriptions = window.confirm(
          `${custom} video(s) already have their own description.\n\n` +
            "OK = replace them with the shared description\nCancel = keep them and only fill empty ones"
        );
      }
    }

    setItems((prev) =>
      prev.map((d) => {
        if (d.save.status === "saved") return d;
        const synopsis =
          sharedDescription && (replaceTypedDescriptions || !d.synopsis.trim()) ? batchDescription : d.synopsis;
        return { ...d, synopsis, tags: batchTags, drama: batchDrama, isPublished: batchPublished };
      })
    );
    announce(
      sharedDescription
        ? "Description, tags, linked drama and publish setting applied to all unsaved videos."
        : "Tags, linked drama and publish setting applied to all unsaved videos."
    );
  };

  const removeItem = (key: string) => {
    const d = itemsRef.current.find((x) => x.key === key);
    if (!d) return;
    controllers.current.get(key)?.abort();
    controllers.current.delete(key);
    if (d.sessionId && d.upload.status !== "uploaded") cancelChunkSession(d.sessionId);
    if (d.thumbPreview) URL.revokeObjectURL(d.thumbPreview);
    setItems((prev) => prev.filter((x) => x.key !== key));
    announce(`${d.file.name} removed.`);
  };

  const retryItem = (key: string) => patch(key, { upload: { status: "queued" } });

  const setCustomThumb = (key: string, file: File | null) => {
    if (!file) return;
    patch(key, (cur) => {
      if (cur.thumbPreview) URL.revokeObjectURL(cur.thumbPreview);
      return { customThumb: file, thumbPreview: URL.createObjectURL(file) };
    });
  };

  // Clean up object URLs if the page unmounts.
  useEffect(
    () => () => {
      itemsRef.current.forEach((d) => d.thumbPreview && URL.revokeObjectURL(d.thumbPreview));
      controllers.current.forEach((c) => c.abort());
    },
    []
  );

  const uploadedCount = items.filter((d) => d.upload.status === "uploaded").length;
  const savedCount = items.filter((d) => d.save.status === "saved").length;
  const pendingSaves = items.filter((d) => d.save.status !== "saved" && d.upload.status !== "failed").length;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      onCancel={(e) => {
        e.preventDefault(); // Esc: go through the same confirm as the close button
        requestClose();
      }}
      className="m-auto h-[100dvh] max-h-[100dvh] w-full max-w-5xl bg-transparent p-0 text-neutral-100 backdrop:bg-black/80 backdrop:backdrop-blur-sm sm:h-[92vh] sm:max-h-[92vh] sm:p-4"
    >
      <div className="flex h-full flex-col overflow-hidden border-[#26324a] bg-[#0d121c] shadow-2xl sm:rounded-2xl sm:border">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#1e283b] px-5 py-4 sm:px-6">
          <div>
            <h2 id={headingId} className="flex items-center gap-2 text-lg font-bold text-white">
              <UploadCloud className="h-5 w-5 text-purple-300" aria-hidden="true" /> Upload reels
            </h2>
            <p className="mt-1 text-sm text-neutral-300">
              Add one video or many. Uploading starts right away — fill in each reel&apos;s details while it uploads,
              then save.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="rounded-lg p-2 text-neutral-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            aria-label="Close upload dialog"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Live region for screen readers */}
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void addFiles(e.dataTransfer.files);
            }}
            className={`rounded-2xl border-2 border-dashed px-4 text-center transition ${
              items.length ? "py-4" : "py-10"
            } ${dragOver ? "border-purple-400 bg-purple-500/10" : "border-[#2b3850] bg-[#111827]"}`}
          >
            <Video className={`mx-auto text-purple-300 ${items.length ? "h-6 w-6" : "h-10 w-10"}`} aria-hidden="true" />
            <p className="mt-2 text-sm text-neutral-200">
              Drag and drop video files here, or{" "}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="font-semibold text-purple-300 underline underline-offset-4 hover:text-purple-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 rounded"
              >
                choose files
              </button>
            </p>
            <p className="mt-1 text-xs text-neutral-400">MP4, WebM, MOV or MKV · up to {MAX_FILES} videos at a time</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={VIDEO_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {rejected.length > 0 && (
            <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <p className="font-semibold">Some files were skipped:</p>
              <ul className="mt-1 list-disc pl-5">
                {rejected.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Batch defaults */}
          {items.length > 1 && (
            <section
              aria-labelledby={`${headingId}-batch`}
              className="rounded-2xl border border-[#26324a] bg-[#111827] p-4"
            >
              <h3 id={`${headingId}-batch`} className="text-sm font-semibold text-white">
                Same for every video
              </h3>
              <p className="mt-0.5 text-sm text-neutral-400">
                Set a shared description, tags, drama and visibility once, then apply them to all unsaved videos.
                Titles stay per video, and you can still edit any video&apos;s description afterwards.
              </p>
              <div className="mt-3 space-y-1.5">
                <label htmlFor={`${headingId}-batch-desc`} className="block text-sm font-medium text-neutral-200">
                  Description for all videos <span className="font-normal text-neutral-400">(optional)</span>
                </label>
                <textarea
                  id={`${headingId}-batch-desc`}
                  rows={2}
                  value={batchDescription}
                  onChange={(e) => setBatchDescription(e.target.value)}
                  placeholder="e.g. Watch the full drama in the app — new episodes daily!"
                  aria-describedby={`${headingId}-batch-desc-hint`}
                  className="w-full rounded-xl border border-[#2b3850] bg-[#161c28] px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
                />
                <p id={`${headingId}-batch-desc-hint`} className="text-xs text-neutral-400">
                  Leave empty to keep each video&apos;s own description. Videos you add after this start with it filled in.
                </p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
                <TextField label="Tags" value={batchTags} onChange={setBatchTags} placeholder="e.g. Romance, Revenge" />
                <DramaPicker label="Linked drama" value={batchDrama} onChange={setBatchDrama} />
                <PublishSwitch checked={batchPublished} onChange={setBatchPublished} />
                <button
                  type="button"
                  onClick={applyBatchDefaults}
                  className="h-11 rounded-xl bg-[#26324a] px-4 text-sm font-semibold text-white hover:bg-[#31405e] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                >
                  Apply to all
                </button>
              </div>
            </section>
          )}

          {/* Per-video cards */}
          {items.length > 0 && (
            <ol className="space-y-4" aria-label="Videos to upload">
              {items.map((d, index) => (
                <ReelDraftCard
                  key={d.key}
                  draft={d}
                  index={index}
                  total={items.length}
                  onChange={(u) => patch(d.key, u)}
                  onSave={() => requestSave(d.key)}
                  onRemove={() => removeItem(d.key)}
                  onRetry={() => retryItem(d.key)}
                  onThumb={(f) => setCustomThumb(d.key, f)}
                />
              ))}
            </ol>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-[#1e283b] bg-[#0b1019] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-neutral-300">
            {items.length === 0
              ? "No videos added yet."
              : `${uploadedCount} of ${items.length} uploaded · ${savedCount} saved as reels`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="h-11 flex-1 rounded-xl bg-[#1a2232] px-4 text-sm font-semibold text-neutral-200 hover:bg-[#232d41] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 sm:flex-none"
            >
              {items.length > 0 && savedCount === items.length ? "Done" : "Close"}
            </button>
            <button
              type="button"
              onClick={saveAll}
              disabled={pendingSaves === 0}
              className="h-11 flex-1 rounded-xl bg-purple-600 px-5 text-sm font-bold text-white hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              {items.length <= 1 ? "Save reel" : `Save all (${pendingSaves})`}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

// ------------------------------------------------------------------

function ReelDraftCard({
  draft: d,
  index,
  total,
  onChange,
  onSave,
  onRemove,
  onRetry,
  onThumb,
}: {
  draft: ReelDraft;
  index: number;
  total: number;
  onChange: (u: Partial<ReelDraft>) => void;
  onSave: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onThumb: (f: File | null) => void;
}) {
  const baseId = useId();
  const thumbInput = useRef<HTMLInputElement>(null);
  const saved = d.save.status === "saved";
  const locked = saved || d.save.status === "saving";
  const titleMissing = !d.title.trim();
  const progress =
    d.upload.status === "uploading" ? d.upload.progress : d.upload.status === "uploaded" ? 1 : 0;

  return (
    <li
      aria-label={`Video ${index + 1} of ${total}: ${d.file.name}`}
      className={`rounded-2xl border bg-[#111827] p-4 ${
        saved ? "border-emerald-500/50" : d.save.status === "error" || d.upload.status === "failed" ? "border-rose-500/50" : "border-[#26324a]"
      }`}
    >
      <div className="grid gap-4 md:grid-cols-[132px_1fr]">
        {/* Thumbnail + file info */}
        <div className="flex gap-3 md:flex-col">
          <div className="relative aspect-[9/16] w-24 shrink-0 overflow-hidden rounded-xl bg-[#0b1019] md:w-full">
            {d.thumbPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.thumbPreview} alt={`Thumbnail for ${d.title || d.file.name}`} className="h-full w-full object-cover" />
            ) : d.inspected ? (
              <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center">
                <Video className="h-6 w-6 text-neutral-500" aria-hidden="true" />
                <span className="text-[11px] leading-tight text-neutral-400">No preview — add a custom thumbnail</span>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-500" aria-hidden="true" />
                <span className="sr-only">Generating thumbnail</span>
              </div>
            )}
            {d.durationSeconds !== null && (
              <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {formatDuration(d.durationSeconds)}
              </span>
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <button
              type="button"
              disabled={locked}
              onClick={() => thumbInput.current?.click()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#2b3850] px-2 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-50"
            >
              <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
              {d.customThumb ? "Change thumbnail" : "Custom thumbnail"}
            </button>
            <input
              ref={thumbInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                onThumb(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <p className="break-all text-xs text-neutral-400" title={d.file.name}>
              {d.file.name}
              <br />
              {formatBytes(d.file.size)}
            </p>
          </div>
        </div>

        {/* Fields */}
        <div className="min-w-0 space-y-3">
          <UploadStatus draft={d} progress={progress} onRetry={onRetry} />

          <fieldset disabled={locked} className="space-y-3 disabled:opacity-70">
            <legend className="sr-only">Details for {d.file.name}</legend>
            <TextField
              label="Title"
              required
              value={d.title}
              onChange={(title) => onChange({ title, save: d.save.status === "error" ? { status: "idle" } : d.save })}
              error={d.save.status === "error" && titleMissing ? "Enter a title for this reel" : undefined}
            />
            <div className="space-y-1.5">
              <label htmlFor={`${baseId}-desc`} className="block text-sm font-medium text-neutral-200">
                Description <span className="font-normal text-neutral-400">(optional)</span>
              </label>
              <textarea
                id={`${baseId}-desc`}
                rows={2}
                value={d.synopsis}
                onChange={(e) => onChange({ synopsis: e.target.value })}
                placeholder="A short hook shown under the reel"
                className="w-full rounded-xl border border-[#2b3850] bg-[#161c28] px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Tags"
                optional
                value={d.tags}
                onChange={(tags) => onChange({ tags })}
                placeholder="Comma separated"
              />
              <DramaPicker label="Linked drama" value={d.drama} onChange={(drama) => onChange({ drama })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr] sm:items-end">
              <TextField
                label="Episode #"
                optional
                inputMode="numeric"
                value={d.episodeNumber}
                onChange={(v) => onChange({ episodeNumber: v.replace(/[^0-9]/g, "") })}
              />
              <PublishSwitch checked={d.isPublished} onChange={(isPublished) => onChange({ isPublished })} />
            </div>
          </fieldset>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1e283b] pt-3">
            <SaveStatus draft={d} />
            <div className="flex gap-2">
              {!saved && (
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={d.save.status === "saving"}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-rose-300 hover:bg-rose-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-50"
                  aria-label={`Remove ${d.file.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
                </button>
              )}
              {!saved && (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={d.save.status === "saving" || d.saveRequested || d.upload.status === "failed"}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-purple-600 px-4 text-sm font-bold text-white hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {d.save.status === "saving" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…
                    </>
                  ) : d.saveRequested ? (
                    "Saves after upload"
                  ) : (
                    "Save reel"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

function UploadStatus({ draft: d, progress, onRetry }: { draft: ReelDraft; progress: number; onRetry: () => void }) {
  const pct = Math.round(progress * 100);
  if (d.upload.status === "failed") {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
        <span className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> Upload failed: {d.upload.error}
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/20 px-3 py-1.5 font-semibold hover:bg-rose-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }
  const label =
    d.upload.status === "queued"
      ? "Waiting to upload"
      : d.upload.status === "uploading"
      ? `Uploading ${pct}%`
      : "Video uploaded";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-medium">
        <span className={d.upload.status === "uploaded" ? "text-emerald-300" : "text-neutral-300"}>{label}</span>
        <span className="text-neutral-400">{formatBytes(d.file.size)}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`Upload progress for ${d.file.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 overflow-hidden rounded-full bg-[#1e283b]"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            d.upload.status === "uploaded" ? "bg-emerald-500" : "bg-purple-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SaveStatus({ draft: d }: { draft: ReelDraft }) {
  if (d.save.status === "saved") {
    return (
      <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        Saved as reel #{d.save.reelId} {d.isPublished ? "(published)" : "(draft)"}
      </p>
    );
  }
  if (d.save.status === "error") {
    return (
      <p role="alert" className="flex items-center gap-1.5 text-sm text-rose-300">
        <AlertCircle className="h-4 w-4" aria-hidden="true" /> {d.save.error}
      </p>
    );
  }
  return <span className="text-sm text-neutral-400">Not saved yet</span>;
}

// ------------------------------------------------------------------
// Small accessible form primitives

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  optional,
  error,
  maxLength,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-neutral-200">
        {label}
        {required && (
          <span className="text-rose-300" aria-hidden="true">
            {" "}
            *
          </span>
        )}
        {optional && <span className="font-normal text-neutral-400"> (optional)</span>}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        required={required}
        maxLength={maxLength}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl border bg-[#161c28] px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 ${
          error ? "border-rose-400" : "border-[#2b3850] focus:border-purple-400"
        }`}
      />
      {error && (
        <p id={`${id}-err`} className="text-sm text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}

export function PublishSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex h-11 items-center gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827] ${
          checked ? "bg-emerald-500" : "bg-[#3a4760]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer select-none text-sm font-medium text-neutral-200">
        {checked ? "Publish now" : "Save as draft"}
      </label>
    </div>
  );
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}s`;
}
