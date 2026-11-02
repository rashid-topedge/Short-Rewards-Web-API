"use client";

import React, { useRef, useState } from "react";
import { Check, Globe, EyeOff, Loader2, Pencil, Play, RefreshCw, Trash2, X } from "lucide-react";
import { inspectVideo, uploadFileChunked } from "@/lib/chunkUpload";
import type { EpisodeItem } from "@/lib/types";

/**
 * A drama's episodes in the console: thumbnail, number, title, length and
 * status, with publish / unpublish, edit title, replace video, preview and
 * delete. Every change returns the drama's updated episode list.
 */
export default function EpisodeList({
  dramaId,
  episodes,
  onChange,
  onPreview,
}: {
  dramaId: number;
  episodes: EpisodeItem[];
  onChange: (episodes: EpisodeItem[]) => void;
  onPreview: (url: string) => void;
}) {
  const [busy, setBusy] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ ep: number; title: string } | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceFor = useRef<number | null>(null);

  const run = async (ep: number, label: string, fn: () => Promise<Response>) => {
    setBusy((b) => ({ ...b, [ep]: label }));
    setError("");
    try {
      const res = await fn();
      const data = (await res.json().catch(() => ({}))) as { episodes?: EpisodeItem[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      if (data.episodes) onChange(data.episodes);
      return true;
    } catch (err) {
      setError(`Episode ${ep}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[ep];
        return next;
      });
    }
  };

  const patchEpisode = (ep: number, body: Record<string, unknown>, label: string) =>
    run(ep, label, () =>
      fetch(`/api/admin/dramas/${dramaId}/episodes/${ep}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );

  const remove = (ep: number) => {
    if (!window.confirm(`Delete episode ${ep}? Its video and thumbnail are removed from storage.`)) return;
    void run(ep, "Deleting…", () => fetch(`/api/admin/dramas/${dramaId}/episodes/${ep}`, { method: "DELETE" }));
  };

  // Replace the video: upload the new file (and a fresh thumbnail + length) into
  // the drama's folder, then point the episode at it; the old files are removed.
  const replaceVideo = async (ep: number, file: File) => {
    await run(ep, "Uploading new video…", async () => {
      const info = await inspectVideo(file).catch(() => ({ durationSeconds: null, poster: null }));
      const video = await uploadFileChunked(file, { folderType: "dramas", dramaId });
      let thumbnailUrl: string | undefined;
      if (info.poster) {
        const stem = file.name.replace(/\.[^.]+$/, "") || `EP-${ep}`;
        thumbnailUrl = (
          await uploadFileChunked(new File([info.poster], `${stem}.jpg`, { type: "image/jpeg" }), { folderType: "dramas", dramaId })
        ).url;
      }
      return fetch(`/api/admin/dramas/${dramaId}/episodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ep,
          url: video.url,
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
          durationSeconds: info.durationSeconds ?? video.durationSeconds ?? null,
        }),
      });
    });
  };

  const saveTitle = async () => {
    if (!editing) return;
    const ok = await patchEpisode(editing.ep, { title: editing.title.trim() || null }, "Saving…");
    if (ok) setEditing(null);
  };

  if (!episodes.length) return <p className="py-6 text-center text-xs text-neutral-500">No episodes yet.</p>;

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          {error}
        </p>
      )}
      <input
        ref={replaceInput}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv,.m4v"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const ep = replaceFor.current;
          e.target.value = "";
          if (file && ep !== null) void replaceVideo(ep, file);
        }}
      />
      <ul className="space-y-2" aria-label="Episodes">
        {episodes.map((ep) => {
          const working = busy[ep.ep];
          const isEditing = editing?.ep === ep.ep;
          return (
            <li key={ep.ep} className="flex items-center gap-3 rounded-xl border border-[#222c3f] bg-[#161c28] p-2.5 text-xs">
              <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-[#0b1019]">
                {ep.previewThumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ep.previewThumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
                {ep.durationSeconds ? (
                  <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 text-[10px] font-semibold text-white">
                    {formatLength(ep.durationSeconds)}
                  </span>
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-rose-600/20 px-2 py-0.5 font-mono font-extrabold text-rose-300">EP {ep.ep}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      ep.isPublished ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-200"
                    }`}
                  >
                    {ep.isPublished ? "Published" : "Draft"}
                  </span>
                </div>
                {isEditing ? (
                  <form
                    className="mt-1 flex items-center gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveTitle();
                    }}
                  >
                    <label htmlFor={`ep-title-${ep.ep}`} className="sr-only">
                      Title for episode {ep.ep}
                    </label>
                    <input
                      id={`ep-title-${ep.ep}`}
                      autoFocus
                      maxLength={120}
                      value={editing.title}
                      onChange={(e) => setEditing({ ep: ep.ep, title: e.target.value })}
                      onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                      placeholder="Episode title (optional)"
                      className="h-8 min-w-0 flex-1 rounded-md border border-[#2b3850] bg-[#0f141f] px-2 text-xs text-white focus:border-rose-400 focus:outline-none"
                    />
                    <IconButton label="Save title" type="submit">
                      <Check className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label="Cancel" onClick={() => setEditing(null)}>
                      <X className="h-3.5 w-3.5" />
                    </IconButton>
                  </form>
                ) : (
                  <p className={`mt-1 truncate ${ep.title ? "text-white" : "italic text-neutral-500"}`}>{ep.title || "No title"}</p>
                )}
                {working && (
                  <p className="mt-1 flex items-center gap-1 text-neutral-300" role="status">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> {working}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {ep.previewUrl && (
                  <IconButton label={`Preview episode ${ep.ep}`} onClick={() => onPreview(ep.previewUrl!)}>
                    <Play className="h-3.5 w-3.5" />
                  </IconButton>
                )}
                <IconButton
                  label={ep.isPublished ? `Unpublish episode ${ep.ep}` : `Publish episode ${ep.ep}`}
                  disabled={!!working}
                  onClick={() => void patchEpisode(ep.ep, { isPublished: !ep.isPublished }, ep.isPublished ? "Unpublishing…" : "Publishing…")}
                >
                  {ep.isPublished ? <EyeOff className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                </IconButton>
                <IconButton label={`Edit title of episode ${ep.ep}`} disabled={!!working} onClick={() => setEditing({ ep: ep.ep, title: ep.title || "" })}>
                  <Pencil className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  label={`Replace video of episode ${ep.ep}`}
                  disabled={!!working}
                  onClick={() => {
                    replaceFor.current = ep.ep;
                    replaceInput.current?.click();
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label={`Delete episode ${ep.ep}`} disabled={!!working} onClick={() => remove(ep.ep)} danger>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  type = "button",
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  type?: "button" | "submit";
  children: React.ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded-lg bg-[#222c3f] p-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-40 ${
        danger ? "text-rose-400 hover:bg-rose-500/20 hover:text-rose-300" : "text-slate-200 hover:bg-[#2e3b52] hover:text-white"
      }`}
    >
      {children}
    </button>
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
