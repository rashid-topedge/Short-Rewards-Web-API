"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Eye,
  EyeOff,
  Globe,
  Heart,
  ImagePlus,
  Link2,
  Loader2,
  Play,
  Search,
  Trash2,
  Tv2,
  UploadCloud,
  Video,
  X,
} from "lucide-react";
import DramaPicker, { type DramaRef } from "@/components/admin/DramaPicker";
import { useCursorPager } from "@/components/admin/useCursorPager";
import ReelUploadDialog, { PublishSwitch, TextField } from "@/components/admin/ReelUploadDialog";
import { inspectVideo, uploadFileChunked } from "@/lib/chunkUpload";
import type { ReelItem } from "@/lib/types";

/** Admin list items also carry signed URLs for previewing private-bucket media. */
type AdminReel = ReelItem & { previewVideoUrl?: string; previewThumbnailUrl?: string | null };

const PAGE_SIZE = 20;

export default function AdminReelsPage() {
  const [reels, setReels] = useState<AdminReel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const pager = useCursorPager();
  const { cursor, reset: resetPager, setNextCursor } = pager;
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview] = useState<AdminReel | null>(null);
  const [editing, setEditing] = useState<AdminReel | "new" | null>(null);

  const searchId = useId();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchReels = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({
        q: debouncedQuery,
        status: statusFilter,
        limit: String(PAGE_SIZE),
      });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/admin/reels?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReels(data.items || []);
      setTotal(data.total || 0);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      console.error("Failed to load reels", err);
      setLoadError("Couldn't load reels. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, statusFilter, cursor, setNextCursor]);

  useEffect(() => {
    fetchReels();
  }, [fetchReels]);

  useEffect(() => setSelectedIds([]), [debouncedQuery, statusFilter, cursor]);

  const allSelected = reels.length > 0 && selectedIds.length === reels.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : reels.map((r) => r.reelId));
  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));

  const handleBulkPublish = async (publish: boolean) => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/reels/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: publish ? "publish" : "unpublish", reelIds: selectedIds }),
      });
      if (res.ok) {
        setNotice(`${selectedIds.length} reel(s) ${publish ? "published" : "moved to drafts"}.`);
        setSelectedIds([]);
        fetchReels();
      } else {
        setNotice("Bulk update failed. Please try again.");
      }
    } finally {
      setBulkLoading(false);
    }
  };

  const togglePublish = async (reel: AdminReel) => {
    const next = !reel.isPublished;
    const res = await fetch(`/api/admin/reels/${reel.reelId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: next }),
    });
    if (res.ok) {
      setReels((prev) => prev.map((r) => (r.reelId === reel.reelId ? { ...r, isPublished: next } : r)));
      setNotice(`"${reel.title}" ${next ? "published" : "moved to drafts"}.`);
    } else {
      setNotice(`Couldn't update "${reel.title}".`);
    }
  };

  const handleDelete = async (reel: AdminReel) => {
    if (!window.confirm(`Delete the reel "${reel.title}"? This can't be undone.`)) return;
    const res = await fetch(`/api/admin/reels/${reel.reelId}`, { method: "DELETE" });
    if (res.ok) {
      setNotice(`"${reel.title}" deleted.`);
      fetchReels();
    } else {
      setNotice(`Couldn't delete "${reel.title}".`);
    }
  };

  const page = pager.page;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstShown = (page - 1) * PAGE_SIZE + 1;

  return (
    <div className="space-y-6 text-neutral-100">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-white">
            <Video className="h-6 w-6 text-purple-300" aria-hidden="true" /> Short reels
          </h1>
          <p className="mt-1 text-sm text-neutral-300">Upload vertical videos, edit their details and control what&apos;s live.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#2b3850] px-4 text-sm font-semibold text-neutral-100 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            <Link2 className="h-4 w-4" aria-hidden="true" /> Add by URL
          </button>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-purple-600 px-4 text-sm font-bold text-white shadow-lg shadow-purple-900/40 hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
          >
            <UploadCloud className="h-4 w-4" aria-hidden="true" /> Upload reels
          </button>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col items-stretch gap-3 rounded-2xl border border-[#1e283b] bg-[#0f141f] p-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search reels
          </label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            placeholder="Search by title, description or drama"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              resetPager();
            }}
            className="h-11 w-full rounded-xl border border-[#2b3850] bg-[#161c28] pl-10 pr-4 text-sm text-white placeholder:text-neutral-500 focus:border-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
          />
        </div>
        <div role="group" aria-label="Filter by status" className="flex gap-1 rounded-xl border border-[#2b3850] bg-[#161c28] p-1">
          {(["all", "published", "draft"] as const).map((st) => (
            <button
              key={st}
              type="button"
              aria-pressed={statusFilter === st}
              onClick={() => {
                setStatusFilter(st);
                resetPager();
              }}
              className={`h-9 flex-1 rounded-lg px-4 text-sm font-semibold capitalize transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 md:flex-none ${
                statusFilter === st ? "bg-purple-600 text-white" : "text-neutral-300 hover:text-white"
              }`}
            >
              {st === "draft" ? "Drafts" : st}
            </button>
          ))}
        </div>
      </div>

      {/* Status messages for everyone, announced to screen readers */}
      <div role="status" aria-live="polite" className={notice ? "" : "sr-only"}>
        {notice && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#2b3850] bg-[#121a29] px-4 py-3 text-sm text-neutral-100">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice("")}
              className="rounded p-1 text-neutral-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              aria-label="Dismiss message"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Bulk bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-purple-500/40 bg-purple-950/40 p-3.5 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-purple-100">
            <span className="font-bold text-white">{selectedIds.length}</span> selected
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleBulkPublish(true)}
              disabled={bulkLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 font-semibold text-white hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50"
            >
              <Globe className="h-4 w-4" aria-hidden="true" /> Publish
            </button>
            <button
              type="button"
              onClick={() => handleBulkPublish(false)}
              disabled={bulkLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-3 font-semibold text-black hover:bg-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:opacity-50"
            >
              <EyeOff className="h-4 w-4" aria-hidden="true" /> Move to drafts
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="h-9 rounded-lg bg-[#232d41] px-3 font-semibold text-neutral-100 hover:bg-[#2e3b52] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {/* Count + select all */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-neutral-300">
        <label className="flex cursor-pointer items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            disabled={reels.length === 0}
            className="h-4 w-4 accent-purple-500"
          />
          Select all on this page
        </label>
        <span>
          {total === 0 ? "No reels" : `Showing ${firstShown}–${firstShown + reels.length - 1} of ${total.toLocaleString()}`}
        </span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-neutral-300" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-purple-400" aria-hidden="true" /> Loading reels…
        </div>
      ) : loadError ? (
        <div role="alert" className="space-y-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 py-12 text-center">
          <p className="text-sm text-rose-100">{loadError}</p>
          <button
            type="button"
            onClick={fetchReels}
            className="h-10 rounded-xl bg-rose-500/20 px-4 text-sm font-semibold text-rose-50 hover:bg-rose-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            Try again
          </button>
        </div>
      ) : reels.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-[#1e283b] bg-[#0f141f] py-16 text-center">
          <Video className="mx-auto h-10 w-10 text-neutral-500" aria-hidden="true" />
          <p className="text-base font-semibold text-neutral-200">No reels found</p>
          <p className="text-sm text-neutral-400">
            {debouncedQuery || statusFilter !== "all" ? "Try a different search or filter." : "Upload your first reels to get started."}
          </p>
          {!debouncedQuery && statusFilter === "all" && (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="mt-2 inline-flex h-11 items-center gap-2 rounded-xl bg-purple-600 px-4 text-sm font-bold text-white hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
            >
              <UploadCloud className="h-4 w-4" aria-hidden="true" /> Upload reels
            </button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5" aria-label="Reels">
          {reels.map((reel) => (
            <ReelCard
              key={reel.reelId}
              reel={reel}
              selected={selectedIds.includes(reel.reelId)}
              onSelect={() => toggleSelect(reel.reelId)}
              onPlay={() => setPreview(reel)}
              onEdit={() => setEditing(reel)}
              onDelete={() => handleDelete(reel)}
              onTogglePublish={() => togglePublish(reel)}
            />
          ))}
        </ul>
      )}

      {/* Pagination */}
      {(pager.hasPrev || pager.hasNext) && (
        <nav aria-label="Reels pages" className="flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            onClick={pager.prev}
            disabled={!pager.hasPrev || loading}
            className="inline-flex h-10 items-center gap-1 rounded-xl border border-[#2b3850] px-3 font-semibold text-neutral-100 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
          </button>
          <span className="text-neutral-300" aria-current="page">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            onClick={pager.next}
            disabled={!pager.hasNext || loading}
            className="inline-flex h-10 items-center gap-1 rounded-xl border border-[#2b3850] px-3 font-semibold text-neutral-100 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      )}

      <ReelUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSaved={() => {
          resetPager();
          fetchReels();
          setNotice("New reels saved.");
        }}
      />

      <PreviewDialog reel={preview} onClose={() => setPreview(null)} />

      <ReelEditDialog
        reel={editing}
        onClose={() => setEditing(null)}
        onSaved={(msg) => {
          setEditing(null);
          setNotice(msg);
          fetchReels();
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------

function ReelCard({
  reel,
  selected,
  onSelect,
  onPlay,
  onEdit,
  onDelete,
  onTogglePublish,
}: {
  reel: AdminReel;
  selected: boolean;
  onSelect: () => void;
  onPlay: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
}) {
  const thumb = reel.previewThumbnailUrl ?? reel.thumbnailUrl;
  return (
    <li
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-[#0f141f] transition ${
        selected ? "border-purple-400 ring-2 ring-purple-400/30" : "border-[#1e283b] hover:border-[#3a4760]"
      }`}
    >
      <div className="relative aspect-[9/14] overflow-hidden bg-[#161c28]">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center">
            <Video className="h-8 w-8 text-neutral-500" aria-hidden="true" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/50" />

        <label className="absolute left-2 top-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-black/60 backdrop-blur">
          <input type="checkbox" checked={selected} onChange={onSelect} className="h-4 w-4 accent-purple-500" />
          <span className="sr-only">Select {reel.title}</span>
        </label>

        <span
          className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${
            reel.isPublished ? "bg-emerald-500 text-white" : "bg-amber-400 text-black"
          }`}
        >
          {reel.isPublished ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {reel.isPublished ? "Live" : "Draft"}
        </span>

        <button
          type="button"
          onClick={onPlay}
          className="absolute inset-0 m-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-600/90 text-white shadow-xl transition hover:bg-purple-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-purple-300"
          aria-label={`Play ${reel.title}`}
        >
          <Play className="ml-0.5 h-5 w-5 fill-white" aria-hidden="true" />
        </button>

        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs font-semibold text-white">
          <span className="flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5">
            <Clock className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">Duration </span>
            {reel.durationSeconds}s
          </span>
          <span className="flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5">
            <Heart className="h-3 w-3 text-rose-300" aria-hidden="true" />
            <span className="sr-only">Likes </span>
            {reel.likeCount}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-2 p-3">
        <div>
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white">{reel.title}</h3>
          {reel.synopsis && <p className="mt-1 line-clamp-2 text-xs text-neutral-300">{reel.synopsis}</p>}
          {reel.dramaTitle && (
            <p className="mt-1 flex items-center gap-1 truncate text-xs font-medium text-purple-300">
              <Tv2 className="h-3 w-3 shrink-0" aria-hidden="true" /> {reel.dramaTitle}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#1e283b] pt-2">
          <span className="flex items-center gap-1 text-xs text-neutral-300">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {reel.viewCount.toLocaleString()}
            <span className="sr-only">views</span>
          </span>
          <div className="flex items-center gap-1">
            <IconButton
              label={reel.isPublished ? `Unpublish ${reel.title}` : `Publish ${reel.title}`}
              onClick={onTogglePublish}
              className={reel.isPublished ? "text-amber-300" : "text-emerald-300"}
            >
              {reel.isPublished ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Globe className="h-4 w-4" aria-hidden="true" />}
            </IconButton>
            <IconButton label={`Edit ${reel.title}`} onClick={onEdit} className="text-sky-300">
              <Edit3 className="h-4 w-4" aria-hidden="true" />
            </IconButton>
            <IconButton label={`Delete ${reel.title}`} onClick={onDelete} className="text-rose-300 hover:bg-rose-500/15">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          </div>
        </div>
      </div>
    </li>
  );
}

function IconButton({
  label,
  onClick,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg bg-[#161c28] hover:bg-[#232d41] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${className}`}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------

function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);
  return ref;
}

function PreviewDialog({ reel, onClose }: { reel: AdminReel | null; onClose: () => void }) {
  const ref = useModal(Boolean(reel));
  const headingId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-full max-w-sm bg-transparent p-4 backdrop:bg-black/90"
    >
      {reel && (
        <div className="space-y-2 rounded-2xl border border-[#2b3850] bg-black p-2">
          <div className="flex items-center justify-between gap-2 px-2 pt-1">
            <h2 id={headingId} className="truncate text-sm font-semibold text-white">
              {reel.title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              aria-label="Close preview"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <video
            src={reel.previewVideoUrl ?? reel.videoUrl}
            controls
            autoPlay
            playsInline
            className="aspect-[9/16] w-full rounded-xl bg-black object-contain"
          />
        </div>
      )}
    </dialog>
  );
}

// ------------------------------------------------------------------

type EditForm = {
  title: string;
  synopsis: string;
  videoUrl: string;
  thumbnailUrl: string;
  durationSeconds: string;
  drama: DramaRef | null;
  episodeNumber: string;
  tags: string;
  isPublished: boolean;
};

function ReelEditDialog({
  reel,
  onClose,
  onSaved,
}: {
  reel: AdminReel | "new" | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const ref = useModal(reel !== null);
  const headingId = useId();
  const videoUrlId = useId();
  const thumbUrlId = useId();
  const durationId = useId();
  const descId = useId();
  const videoInput = useRef<HTMLInputElement>(null);
  const thumbInput = useRef<HTMLInputElement>(null);
  const isNew = reel === "new";
  const existing = reel && reel !== "new" ? reel : null;

  const [form, setForm] = useState<EditForm>(emptyForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [videoUpload, setVideoUpload] = useState<{ pct: number; name: string } | null>(null);
  const [thumbUploading, setThumbUploading] = useState(false);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);

  useEffect(() => {
    if (reel === null) return;
    setError("");
    setVideoUpload(null);
    if (reel === "new") {
      setForm(emptyForm());
      setThumbPreview(null);
    } else {
      setForm({
        title: reel.title || "",
        synopsis: reel.synopsis || "",
        videoUrl: reel.videoUrl || "",
        thumbnailUrl: reel.thumbnailUrl || "",
        durationSeconds: String(reel.durationSeconds || ""),
        drama: reel.dramaId ? { dramaId: reel.dramaId, title: reel.dramaTitle ?? null } : null,
        episodeNumber: reel.episodeNumber ? String(reel.episodeNumber) : "",
        tags: (reel.tags || []).join(", "),
        isPublished: Boolean(reel.isPublished),
      });
      setThumbPreview(reel.previewThumbnailUrl ?? reel.thumbnailUrl ?? null);
    }
  }, [reel]);

  const set = (patch: Partial<EditForm>) => setForm((f) => ({ ...f, ...patch }));

  const replaceVideo = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setVideoUpload({ pct: 0, name: file.name });
    try {
      const info = await inspectVideo(file);
      const result = await uploadFileChunked(file, {
        folderType: "reels",
        uniqueName: true,
        createReel: false,
        onProgress: (done, total) => setVideoUpload({ pct: Math.round((done / total) * 100), name: file.name }),
      });
      set({ videoUrl: result.url, durationSeconds: String(info.durationSeconds ?? result.durationSeconds ?? form.durationSeconds) });
      // Use the new video's frame as thumbnail if none was set.
      if (!form.thumbnailUrl && info.poster) {
        await uploadThumb(new File([info.poster], "poster.jpg", { type: "image/jpeg" }));
      }
      setVideoUpload(null);
    } catch (err) {
      setVideoUpload(null);
      setError(err instanceof Error ? err.message : "Video upload failed");
    }
  };

  const uploadThumb = async (file: File | undefined) => {
    if (!file) return;
    setThumbUploading(true);
    try {
      const result = await uploadFileChunked(file, { folderType: "reels", uniqueName: true, createReel: false });
      set({ thumbnailUrl: result.url });
      setThumbPreview(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thumbnail upload failed");
    } finally {
      setThumbUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setError("Enter a title for this reel.");
    if (!form.videoUrl.trim()) return setError("Add a video: upload a file or paste a video URL.");
    setSaving(true);
    setError("");
    try {
      const res = await fetch(existing ? `/api/admin/reels/${existing.reelId}` : "/api/admin/reels", {
        method: existing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          synopsis: form.synopsis.trim(),
          videoUrl: form.videoUrl.trim(),
          thumbnailUrl: form.thumbnailUrl.trim(),
          durationSeconds: Number(form.durationSeconds) || 0,
          dramaId: form.drama?.dramaId ?? null,
          episodeNumber: form.episodeNumber ? Number(form.episodeNumber) : null,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
          isPublished: form.isPublished,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save the reel");
      onSaved(existing ? `"${form.title.trim()}" updated.` : `"${form.title.trim()}" created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the reel");
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || videoUpload !== null || thumbUploading;

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto max-h-[100dvh] w-full max-w-2xl bg-transparent p-0 text-neutral-100 backdrop:bg-black/80 backdrop:backdrop-blur-sm sm:max-h-[92vh] sm:p-4"
    >
      {reel !== null && (
        <form onSubmit={submit} noValidate className="flex max-h-[100dvh] flex-col overflow-hidden border-[#26324a] bg-[#0d121c] shadow-2xl sm:max-h-[88vh] sm:rounded-2xl sm:border">
          <div className="flex items-center justify-between border-b border-[#1e283b] px-5 py-4">
            <h2 id={headingId} className="flex items-center gap-2 text-lg font-bold text-white">
              <Video className="h-5 w-5 text-purple-300" aria-hidden="true" />
              {isNew ? "Add reel by URL" : "Edit reel"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg p-2 text-neutral-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-40"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
              </div>
            )}

            <TextField label="Title" required value={form.title} onChange={(title) => set({ title })} />

            <div className="space-y-1.5">
              <label htmlFor={descId} className="block text-sm font-medium text-neutral-200">
                Description <span className="font-normal text-neutral-400">(optional)</span>
              </label>
              <textarea
                id={descId}
                rows={3}
                value={form.synopsis}
                onChange={(e) => set({ synopsis: e.target.value })}
                placeholder="A short hook shown under the reel"
                className="w-full rounded-xl border border-[#2b3850] bg-[#161c28] px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
              />
            </div>

            {/* Video */}
            <div className="space-y-1.5">
              <label htmlFor={videoUrlId} className="block text-sm font-medium text-neutral-200">
                Video<span className="text-rose-300" aria-hidden="true"> *</span>
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id={videoUrlId}
                  type="url"
                  value={form.videoUrl}
                  onChange={(e) => set({ videoUrl: e.target.value })}
                  placeholder="https://… (.mp4 or .m3u8)"
                  aria-describedby={`${videoUrlId}-hint`}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-[#2b3850] bg-[#161c28] px-3 font-mono text-sm text-white placeholder:text-neutral-500 focus:border-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
                />
                <button
                  type="button"
                  onClick={() => videoInput.current?.click()}
                  disabled={busy}
                  className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#232d41] px-4 text-sm font-semibold text-white hover:bg-[#2e3b52] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-50"
                >
                  <UploadCloud className="h-4 w-4" aria-hidden="true" /> {isNew ? "Upload file" : "Replace video"}
                </button>
                <input
                  ref={videoInput}
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    void replaceVideo(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              <p id={`${videoUrlId}-hint`} className="text-xs text-neutral-400">
                Paste a link, or upload a file to Backblaze. For many videos at once, use “Upload reels”.
              </p>
              {videoUpload && (
                <div className="space-y-1" role="status">
                  <p className="text-xs text-neutral-300">
                    Uploading {videoUpload.name}… {videoUpload.pct}%
                  </p>
                  <div
                    role="progressbar"
                    aria-label="Video upload progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={videoUpload.pct}
                    className="h-2 overflow-hidden rounded-full bg-[#1e283b]"
                  >
                    <div className="h-full rounded-full bg-purple-500 transition-[width]" style={{ width: `${videoUpload.pct}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* Thumbnail */}
            <div className="space-y-1.5">
              <label htmlFor={thumbUrlId} className="block text-sm font-medium text-neutral-200">
                Thumbnail <span className="font-normal text-neutral-400">(optional)</span>
              </label>
              <div className="flex gap-3">
                <div className="aspect-[9/16] w-16 shrink-0 overflow-hidden rounded-lg bg-[#161c28]">
                  {thumbPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbPreview} alt="Current thumbnail" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImagePlus className="h-5 w-5 text-neutral-500" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <input
                    id={thumbUrlId}
                    type="url"
                    value={form.thumbnailUrl}
                    onChange={(e) => {
                      set({ thumbnailUrl: e.target.value });
                      setThumbPreview(e.target.value || null);
                    }}
                    placeholder="https://… image link"
                    className="h-11 w-full rounded-xl border border-[#2b3850] bg-[#161c28] px-3 text-sm text-white placeholder:text-neutral-500 focus:border-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
                  />
                  <button
                    type="button"
                    onClick={() => thumbInput.current?.click()}
                    disabled={busy}
                    className="inline-flex h-9 w-fit items-center gap-1.5 rounded-lg border border-[#2b3850] px-3 text-sm font-semibold text-neutral-100 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-50"
                  >
                    {thumbUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ImagePlus className="h-4 w-4" aria-hidden="true" />
                    )}
                    {thumbUploading ? "Uploading…" : "Upload image"}
                  </button>
                  <input
                    ref={thumbInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => {
                      void uploadThumb(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DramaPicker label="Linked drama" value={form.drama} onChange={(drama) => set({ drama })} />
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Episode #"
                  optional
                  inputMode="numeric"
                  value={form.episodeNumber}
                  onChange={(v) => set({ episodeNumber: v.replace(/[^0-9]/g, "") })}
                />
                <div className="space-y-1.5">
                  <label htmlFor={durationId} className="block text-sm font-medium text-neutral-200">
                    Length (sec)
                  </label>
                  <input
                    id={durationId}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={form.durationSeconds}
                    onChange={(e) => set({ durationSeconds: e.target.value })}
                    className="h-11 w-full rounded-xl border border-[#2b3850] bg-[#161c28] px-3 text-sm text-white focus:border-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
                  />
                </div>
              </div>
            </div>

            <TextField label="Tags" optional value={form.tags} onChange={(tags) => set({ tags })} placeholder="Comma separated" />

            <PublishSwitch checked={form.isPublished} onChange={(isPublished) => set({ isPublished })} />
          </div>

          <div className="flex justify-end gap-2 border-t border-[#1e283b] bg-[#0b1019] px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-11 rounded-xl bg-[#1a2232] px-4 text-sm font-semibold text-neutral-200 hover:bg-[#232d41] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-purple-600 px-5 text-sm font-bold text-white hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {saving ? "Saving…" : isNew ? "Create reel" : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

function emptyForm(): EditForm {
  return {
    title: "",
    synopsis: "",
    videoUrl: "",
    thumbnailUrl: "",
    durationSeconds: "",
    drama: null,
    episodeNumber: "",
    tags: "",
    isPublished: true,
  };
}
