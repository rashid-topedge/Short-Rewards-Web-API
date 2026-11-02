"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Trash2, UploadCloud, X } from "lucide-react";
import { cancelChunkSession, formatBytes, inspectVideo, uploadFileChunked, UploadAbortedError } from "@/lib/chunkUpload";
import type { EpisodeItem } from "@/lib/types";

const PARALLEL_UPLOADS = 2;
const MAX_FILES = 300;
const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv,.m4v";

/**
 * Episode number from a file name: "EP 05.mp4", "Episode-12", "e7", "S01E03"
 * → 5 / 12 / 7 / 3; otherwise the last number in the name ("Drama_5.mp4" → 5).
 * null when there is no number.
 */
export function episodeNumberFromName(name: string): number | null {
  const stem = name.replace(/\.[^.]+$/, "");
  const tagged = stem.match(/(?:^|[^a-z])(?:ep(?:isode)?|e)[\s._#-]*0*(\d{1,5})(?!\d)/i);
  // Without an "EP" tag, ignore quality/codec/year tokens ("720p", "x264", "4K", "2026").
  const plain = stem
    .replace(/\b\d{3,4}[pi]\b|\b[248]k\b|\b[xh][.\s-]?26[45]\b|\b(?:19|20)\d{2}\b/gi, " ")
    .match(/(\d{1,5})(?!.*\d)/);
  const n = tagged ? Number(tagged[1]) : Number(plain?.[1] ?? NaN);
  return Number.isInteger(n) && n > 0 ? n : null;
}

type Draft = {
  key: string;
  file: File;
  ep: string;
  /** How the number was chosen, shown under the field. */
  epSource: "name" | "next";
  replace: boolean;
  /** Optional episode title. */
  title: string;
  published: boolean;
  /** Length and a poster frame, read from the video in the browser. */
  inspected: boolean;
  durationSeconds: number | null;
  poster: Blob | null;
  posterPreview: string | null;
  sessionId?: string;
  upload:
    | { status: "queued" }
    | { status: "uploading"; progress: number }
    | { status: "uploaded"; url: string }
    | { status: "failed"; error: string };
  save: { status: "idle" } | { status: "saving" } | { status: "saved" } | { status: "error"; error: string };
  saveRequested: boolean;
};

let keySeq = 0;

export default function EpisodeUploadDialog({
  open,
  drama,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean;
  drama: { dramaId: number; title: string | null };
  /** Episodes the drama already has. */
  existing: EpisodeItem[];
  onClose: () => void;
  /** Called with the drama's updated episode list after each save. */
  onSaved: (episodes: EpisodeItem[]) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Draft[]>([]);
  const itemsRef = useRef<Draft[]>([]);
  itemsRef.current = items;
  const controllers = useRef(new Map<string, AbortController>());
  const [publish, setPublish] = useState(true);
  const [rejected, setRejected] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const existingEps = useRef(new Set<number>());
  existingEps.current = new Set(existing.map((e) => e.ep));

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  const patch = useCallback((key: string, update: Partial<Draft>) => {
    setItems((prev) => prev.map((d) => (d.key === key ? { ...d, ...update } : d)));
  }, []);

  // ---- adding files
  const addFiles = async (list: FileList | File[] | null) => {
    if (!list) return;
    const bad: string[] = [];
    const accepted: File[] = [];
    for (const f of Array.from(list)) {
      const isVideo = f.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|m4v)$/i.test(f.name);
      if (!isVideo) bad.push(`${f.name} is not a video`);
      else if (itemsRef.current.length + accepted.length >= MAX_FILES) bad.push(`${f.name}: limit is ${MAX_FILES} files at a time`);
      else accepted.push(f);
    }
    setRejected(bad);
    if (!accepted.length) return;

    // Numbers from the file names first, then the next free number for the rest.
    const used = new Set<number>([...existingEps.current, ...itemsRef.current.map((d) => Number(d.ep)).filter(Boolean)]);
    const parsed = accepted
      .map((file) => ({ file, n: episodeNumberFromName(file.name) }))
      .sort((a, b) => (a.n ?? Infinity) - (b.n ?? Infinity) || a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));
    const taken = new Set<number>();
    let next = Math.max(0, ...used) + 1;
    const drafts: Draft[] = parsed.map(({ file, n }) => {
      let ep: number;
      let epSource: Draft["epSource"] = "name";
      if (n !== null && !taken.has(n)) ep = n;
      else {
        while (used.has(next) || taken.has(next)) next++;
        ep = next;
        epSource = "next";
      }
      taken.add(ep);
      return {
        key: `ep-${++keySeq}`,
        file,
        ep: String(ep),
        epSource,
        replace: false,
        title: "",
        published: publish,
        inspected: false,
        durationSeconds: null,
        poster: null,
        posterPreview: null,
        upload: { status: "queued" },
        save: { status: "idle" },
        saveRequested: false,
      };
    });
    setItems((prev) => [...prev, ...drafts].sort((a, b) => Number(a.ep) - Number(b.ep)));
    setAnnouncement(`${drafts.length} file${drafts.length === 1 ? "" : "s"} added. Uploading started.`);

    // Read each video's length and grab a thumbnail frame, one at a time (like reels).
    for (const d of drafts) {
      const info = await inspectVideo(d.file).catch(() => ({ durationSeconds: null, poster: null }));
      if (!itemsRef.current.some((x) => x.key === d.key)) continue;
      patch(d.key, {
        inspected: true,
        durationSeconds: info.durationSeconds,
        poster: info.poster,
        posterPreview: info.poster ? URL.createObjectURL(info.poster) : null,
      });
    }
  };

  // ---- upload queue
  const startUpload = useCallback(
    async (d: Draft) => {
      const controller = new AbortController();
      controllers.current.set(d.key, controller);
      patch(d.key, { upload: { status: "uploading", progress: 0 } });
      try {
        const result = await uploadFileChunked(d.file, {
          folderType: "dramas",
          dramaId: drama.dramaId,
          sessionId: d.sessionId,
          signal: controller.signal,
          onSession: (sessionId) => patch(d.key, { sessionId }),
          onProgress: (done, total) => patch(d.key, { upload: { status: "uploading", progress: total ? done / total : 1 } }),
        });
        patch(d.key, { upload: { status: "uploaded", url: result.url } });
      } catch (err) {
        if (err instanceof UploadAbortedError) return;
        patch(d.key, { upload: { status: "failed", error: err instanceof Error ? err.message : String(err) } });
      } finally {
        controllers.current.delete(d.key);
      }
    },
    [drama.dramaId, patch]
  );

  useEffect(() => {
    const running = items.filter((d) => d.upload.status === "uploading").length;
    const free = PARALLEL_UPLOADS - running;
    if (free <= 0) return;
    items.filter((d) => d.upload.status === "queued").slice(0, free).forEach((d) => void startUpload(d));
  }, [items, startUpload]);

  // ---- validation
  const problemFor = (d: Draft): string | null => {
    const n = Number(d.ep);
    if (!Number.isInteger(n) || n < 1 || n > 100000) return "Enter an episode number (1 or more).";
    if (items.some((o) => o.key !== d.key && o.save.status !== "saved" && Number(o.ep) === n)) return "Another file has the same number.";
    if (existingEps.current.has(n) && !d.replace && d.save.status !== "saved") return `Episode ${n} already exists.`;
    return null;
  };

  // ---- saving
  const saveOne = useCallback(
    async (key: string) => {
      const d = itemsRef.current.find((x) => x.key === key);
      if (!d || d.upload.status !== "uploaded" || d.save.status === "saving" || d.save.status === "saved") return;
      patch(key, { save: { status: "saving" }, saveRequested: false });
      try {
        // The thumbnail goes next to the video, in the drama's own folder.
        let thumbnailUrl: string | null = null;
        if (d.poster) {
          const stem = d.file.name.replace(/\.[^.]+$/, "") || `EP-${d.ep}`;
          const posterFile = new File([d.poster], `${stem}.jpg`, { type: "image/jpeg" });
          thumbnailUrl = (await uploadFileChunked(posterFile, { folderType: "dramas", dramaId: drama.dramaId })).url;
        }
        const res = await fetch(`/api/admin/dramas/${drama.dramaId}/episodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ep: Number(d.ep),
            url: d.upload.url,
            title: d.title.trim() || null,
            thumbnailUrl,
            durationSeconds: d.durationSeconds,
            isPublished: d.published,
            ifNew: !d.replace,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { episodes?: EpisodeItem[]; error?: string };
        if (!res.ok) throw new Error(data.error || "Could not save the episode");
        patch(key, { save: { status: "saved" } });
        if (data.episodes) onSaved(data.episodes);
        setAnnouncement(`Episode ${d.ep} saved.`);
      } catch (err) {
        patch(key, { save: { status: "error", error: err instanceof Error ? err.message : String(err) } });
      }
    },
    [drama.dramaId, onSaved, patch]
  );

  // Save files whose upload finished after "Save all" was clicked.
  useEffect(() => {
    items.filter((d) => d.saveRequested && d.inspected && d.upload.status === "uploaded").forEach((d) => void saveOne(d.key));
  }, [items, saveOne]);

  const unsaved = items.filter((d) => d.save.status !== "saved");
  const blocked = unsaved.filter((d) => problemFor(d));
  const saveAll = () => {
    if (blocked.length) {
      setAnnouncement(`Fix the episode numbers marked in red first (${blocked.length}).`);
      return;
    }
    setItems((prev) => prev.map((d) => (d.save.status === "saved" || d.upload.status === "failed" ? d : { ...d, saveRequested: true })));
  };

  const remove = (d: Draft) => {
    controllers.current.get(d.key)?.abort();
    if (d.sessionId && d.upload.status !== "uploaded") cancelChunkSession(d.sessionId);
    setItems((prev) => prev.filter((x) => x.key !== d.key));
  };

  const close = () => {
    const pending = items.filter((d) => d.save.status !== "saved");
    if (pending.length && !window.confirm(`${pending.length} file${pending.length === 1 ? " isn't" : "s aren't"} saved as episodes yet. Close and discard ${pending.length === 1 ? "it" : "them"}?`)) return;
    pending.forEach((d) => {
      controllers.current.get(d.key)?.abort();
      if (d.sessionId && d.upload.status !== "uploaded") cancelChunkSession(d.sessionId);
    });
    setItems([]);
    setRejected([]);
    onClose();
  };

  const uploadedCount = items.filter((d) => d.upload.status === "uploaded").length;
  const savedCount = items.filter((d) => d.save.status === "saved").length;
  const waiting = unsaved.some((d) => d.saveRequested);

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="m-auto h-full max-h-[92vh] w-full max-w-3xl bg-transparent p-2 text-neutral-100 backdrop:bg-black/80 backdrop:backdrop-blur-sm sm:p-4"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#26324a] bg-[#0d121c] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#1e283b] px-5 py-4">
          <div className="min-w-0">
            <h2 id={headingId} className="flex items-center gap-2 text-lg font-bold text-white">
              <UploadCloud className="h-5 w-5 text-rose-400" aria-hidden="true" /> Upload episodes
            </h2>
            <p className="mt-0.5 truncate text-sm text-neutral-400">
              {drama.title || `Drama ${drama.dramaId}`} · files are stored in this drama&apos;s own folder
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
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
            className={`rounded-2xl border-2 border-dashed px-4 text-center transition ${items.length ? "py-4" : "py-10"} ${
              dragOver ? "border-rose-400 bg-rose-500/10" : "border-[#2b3850] bg-[#111827]"
            }`}
          >
            <p className="text-sm text-neutral-200">
              Drag and drop episode videos here, or{" "}
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="rounded font-semibold text-rose-300 underline underline-offset-4 hover:text-rose-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                choose files
              </button>
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Episode numbers come from the file names (&ldquo;EP 05.mp4&rdquo; → 5); files without a number get the next free one.
              You can change any number before saving.
            </p>
            <input
              ref={fileInput}
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

          {items.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={publish}
                onChange={(e) => {
                  const on = e.target.checked;
                  setPublish(on);
                  // Applies to every file not saved yet; each can still be changed below.
                  setItems((prev) => prev.map((d) => (d.save.status === "saved" ? d : { ...d, published: on })));
                }}
                className="h-4 w-4 accent-rose-500"
              />
              Publish all when saved <span className="text-neutral-400">(or set each episode below)</span>
            </label>
          )}

          {items.length > 0 && (
            <ol className="space-y-2" aria-label="Episode files">
              {items.map((d) => {
                const problem = problemFor(d);
                const locked = d.save.status === "saved" || d.save.status === "saving";
                const inputId = `${d.key}-ep`;
                const exists = existingEps.current.has(Number(d.ep));
                return (
                  <li
                    key={d.key}
                    className={`grid grid-cols-[112px_1fr_auto] items-start gap-3 rounded-xl border bg-[#111827] p-3 ${
                      d.save.status === "saved"
                        ? "border-emerald-500/50"
                        : problem || d.upload.status === "failed" || d.save.status === "error"
                        ? "border-rose-500/50"
                        : "border-[#26324a]"
                    }`}
                  >
                    <div>
                      <label htmlFor={inputId} className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                        Episode
                      </label>
                      <input
                        id={inputId}
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={d.ep}
                        disabled={locked}
                        onChange={(e) => patch(d.key, { ep: e.target.value, replace: false, save: { status: "idle" } })}
                        aria-invalid={problem ? true : undefined}
                        aria-describedby={problem ? `${d.key}-problem` : undefined}
                        className="mt-1 h-10 w-full rounded-lg border border-[#2b3850] bg-[#161c28] px-2 font-mono text-sm text-white focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 disabled:opacity-60"
                      />
                      <div className="mt-2 aspect-video w-full overflow-hidden rounded-md bg-[#0b1019]">
                        {d.posterPreview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.posterPreview} alt={`Thumbnail for episode ${d.ep}`} className="h-full w-full object-cover" />
                        ) : !d.inspected ? (
                          <div className="flex h-full items-center justify-center" role="status">
                            <Loader2 className="h-4 w-4 animate-spin text-neutral-500" aria-hidden="true" />
                            <span className="sr-only">Reading video</span>
                          </div>
                        ) : (
                          <p className="flex h-full items-center justify-center px-1 text-center text-[10px] text-neutral-500">No thumbnail</p>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 space-y-1.5">
                      <p className="truncate text-sm font-medium text-white" title={d.file.name}>
                        {d.file.name}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {formatBytes(d.file.size)}
                        {d.durationSeconds ? ` · ${formatLength(d.durationSeconds)}` : ""}
                        {d.epSource === "next" && d.save.status !== "saved" && " · no number in the name, next free number used"}
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <label htmlFor={`${d.key}-title`} className="sr-only">
                          Title for episode {d.ep} (optional)
                        </label>
                        <input
                          id={`${d.key}-title`}
                          value={d.title}
                          disabled={locked}
                          maxLength={120}
                          onChange={(e) => patch(d.key, { title: e.target.value })}
                          placeholder="Episode title (optional)"
                          className="h-9 min-w-0 flex-1 rounded-lg border border-[#2b3850] bg-[#161c28] px-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 disabled:opacity-60"
                        />
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-200">
                          <input
                            type="checkbox"
                            checked={d.published}
                            disabled={locked}
                            onChange={(e) => patch(d.key, { published: e.target.checked })}
                            className="h-3.5 w-3.5 accent-rose-500"
                          />
                          Published
                        </label>
                      </div>
                      <Status d={d} onRetry={() => patch(d.key, { upload: { status: "queued" } })} />
                      {problem && (
                        <p id={`${d.key}-problem`} className="flex items-center gap-1.5 text-xs text-rose-200">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {problem}
                        </p>
                      )}
                      {exists && !locked && (
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-amber-100">
                          <input
                            type="checkbox"
                            checked={d.replace}
                            onChange={(e) => patch(d.key, { replace: e.target.checked })}
                            className="h-3.5 w-3.5 accent-amber-500"
                          />
                          Replace the existing episode {d.ep} (its old video is deleted)
                        </label>
                      )}
                      {d.save.status === "error" && <p className="text-xs text-rose-200">{d.save.error}</p>}
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(d)}
                      disabled={d.save.status === "saving" || d.save.status === "saved"}
                      aria-label={`Remove ${d.file.name}`}
                      title="Remove"
                      className="rounded-lg p-2 text-rose-300 hover:bg-rose-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-[#1e283b] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-neutral-300">
            {items.length
              ? `${uploadedCount} of ${items.length} uploaded · ${savedCount} saved as episodes`
              : "No files yet"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="h-11 rounded-xl bg-[#1a2232] px-4 text-sm font-semibold text-neutral-200 hover:bg-[#232d41] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              {unsaved.length ? "Cancel" : "Done"}
            </button>
            <button
              type="button"
              onClick={saveAll}
              disabled={!unsaved.length || waiting}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-50"
            >
              {waiting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {waiting ? "Saving as uploads finish…" : `Save ${unsaved.length || ""} episode${unsaved.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

/** 95 → "1:35". */
function formatLength(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

function Status({ d, onRetry }: { d: Draft; onRetry: () => void }) {
  if (d.save.status === "saved")
    return (
      <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Saved as episode {d.ep}
      </p>
    );
  if (d.save.status === "saving")
    return (
      <p className="flex items-center gap-1.5 text-xs text-neutral-300">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Saving…
      </p>
    );
  switch (d.upload.status) {
    case "queued":
      return <p className="text-xs text-neutral-400">Waiting to upload…</p>;
    case "uploading": {
      const pct = Math.round(d.upload.progress * 100);
      return (
        <div className="space-y-1">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-[#1e283b]"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Uploading ${d.file.name}`}
          >
            <div className="h-full bg-rose-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-neutral-400">Uploading… {pct}%</p>
        </div>
      );
    }
    case "uploaded":
      return <p className="text-xs text-emerald-300">Uploaded{d.saveRequested ? "" : " · not saved yet"}</p>;
    case "failed":
      return (
        <p className="flex flex-wrap items-center gap-2 text-xs text-rose-200">
          Upload failed: {d.upload.error}
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded font-semibold text-rose-100 underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" /> Retry
          </button>
        </p>
      );
  }
}
