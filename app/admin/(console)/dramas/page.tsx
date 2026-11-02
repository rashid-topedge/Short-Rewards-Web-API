"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Search,
  Plus,
  Tv2,
  Trash2,
  Edit3,
  ListVideo,
  CheckCircle2,
  AlertCircle,
  Play,
  X,
  Loader2,
  CheckSquare,
  Square,
  Globe,
  EyeOff,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import FileUploadManager from "@/components/admin/FileUploadManager";
import EpisodeUploadDialog from "@/components/admin/EpisodeUploadDialog";
import EpisodeList from "@/components/admin/EpisodeList";
import { useCursorPager } from "@/components/admin/useCursorPager";
import type { DramaCard, EpisodeItem } from "@/lib/types";

/** Folder name for a new drama's cover, before the drama exists: "love-war-k3x9p2". */
function newDramaFolder(title: string, suffix: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${slug || "drama"}-${suffix}`;
}

export default function AdminDramasPage() {
  // Who is signed in: moderators only manage dramas they created (leads also
  // plain moderators' dramas); bulk actions are admin-only.
  const [viewer, setViewer] = useState<{ role: "admin" | "moderator"; lead: boolean } | null>(null);
  const isAdmin = viewer?.role === "admin";
  const [mineOnly, setMineOnly] = useState(false);
  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => me && setViewer({ role: me.role, lead: Boolean(me.lead) }))
      .catch(() => {});
  }, []);
  const canChange = (d: DramaCard) => isAdmin || Boolean(d.permissions?.canEdit);

  const [dramas, setDramas] = useState<DramaCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const pager = useCursorPager();
  const { cursor, reset: resetPager, setNextCursor } = pager;
  const limit = 24;

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Drama Modal (Create / Edit)
  const [isDramaModalOpen, setIsDramaModalOpen] = useState(false);
  const [editingDrama, setEditingDrama] = useState<DramaCard | null>(null);
  const [dramaForm, setDramaForm] = useState({
    title: "",
    cover: "",
    synopsis: "",
    tags: "",
    playCount: 0,
    likeCount: 0,
    isPublished: false,
  });
  const [folderFiles, setFolderFiles] = useState<FileList | null>(null);
  const [uploadingFolder, setUploadingFolder] = useState(false);
  const [showCoverUploader, setShowCoverUploader] = useState(false);
  const [showEpisodeUploader, setShowEpisodeUploader] = useState(false);
  const [submittingDrama, setSubmittingDrama] = useState(false);
  const [dramaError, setDramaError] = useState("");
  // New drama: random part of its bucket folder name, and the folder its cover went to.
  const [folderSuffix, setFolderSuffix] = useState("");
  const [coverFolder, setCoverFolder] = useState<string | null>(null);
  // What the cover picture looks like (a signed link, or the file just uploaded).
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  // Episode Manager Modal
  const [isEpisodeModalOpen, setIsEpisodeModalOpen] = useState(false);
  const [currentDrama, setCurrentDrama] = useState<DramaCard | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [newEpisodeForm, setNewEpisodeForm] = useState({
    ep: 1,
    url: "",
    isPublished: true,
  });
  const [previewStreamUrl, setPreviewStreamUrl] = useState<string | null>(null);

  const fetchDramas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery,
        status: statusFilter,
        limit: String(limit),
      });
      if (cursor) params.set("cursor", cursor);
      if (mineOnly) params.set("mine", "1");
      const res = await fetch(`/api/admin/dramas?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDramas(data.items || []);
        setTotal(data.total || 0);
        setNextCursor(data.nextCursor ?? null);
      }
    } catch (err) {
      console.error("Failed to load dramas", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, cursor, setNextCursor, mineOnly]);

  useEffect(() => {
    fetchDramas();
  }, [fetchDramas]);

  // Bulk selection. "Select all N dramas" selects every drama matching the
  // current search/filter on every page; unticking one then keeps it
  // (excludedIds), e.g. "delete all but one".
  const [allMatching, setAllMatching] = useState(false);
  const [excludedIds, setExcludedIds] = useState<number[]>([]);
  const [bulkNotice, setBulkNotice] = useState("");
  const isChecked = (id: number) => (allMatching ? !excludedIds.includes(id) : selectedIds.includes(id));
  const selectedCount = allMatching ? Math.max(0, total - excludedIds.length) : selectedIds.length;
  const pageAllChecked = dramas.length > 0 && dramas.every((d) => isChecked(d.dramaId));

  const clearSelection = () => {
    setAllMatching(false);
    setExcludedIds([]);
    setSelectedIds([]);
  };
  const selectAllMatching = () => {
    setAllMatching(true);
    setExcludedIds([]);
    setSelectedIds([]);
  };

  // Page changes keep an "all dramas" selection; a page-only selection and any filter change start over.
  useEffect(() => setSelectedIds([]), [searchQuery, statusFilter, cursor]);
  useEffect(() => {
    setAllMatching(false);
    setExcludedIds([]);
  }, [searchQuery, statusFilter]);

  const toggleSelectAll = () => {
    const ids = dramas.map((d) => d.dramaId);
    if (allMatching) {
      setExcludedIds((prev) => (pageAllChecked ? [...new Set([...prev, ...ids])] : prev.filter((id) => !ids.includes(id))));
      return;
    }
    setSelectedIds(pageAllChecked ? [] : ids);
  };

  const toggleSelectDrama = (id: number) => {
    if (allMatching) {
      setExcludedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
      return;
    }
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    const count = selectedCount;
    if (count === 0) return;
    if (allMatching) {
      const typed = window.prompt(
        `Delete ${count.toLocaleString()} dramas${searchQuery ? ` matching "${searchQuery}"` : ""}${
          statusFilter !== "all" ? ` in "${statusFilter}"` : ""
        }${excludedIds.length ? `, keeping the ${excludedIds.length} you unticked` : ""}?\n\nTheir episodes and linked reels are deleted too, files are removed from storage, and this can't be undone.\n\nType DELETE to confirm.`
      );
      if (typed?.trim().toUpperCase() !== "DELETE") return;
    } else if (
      !window.confirm(`Delete ${count} selected drama${count === 1 ? "" : "s"} with all their episodes and linked reels? This can't be undone.`)
    ) {
      return;
    }
    setBulkLoading(true);
    setBulkNotice("");
    try {
      const res = await fetch("/api/admin/dramas/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          allMatching
            ? { action: "delete", all: true, filter: { q: searchQuery, status: statusFilter }, excludeIds: excludedIds }
            : { action: "delete", dramaIds: selectedIds }
        ),
      });
      const data = (await res.json().catch(() => ({}))) as { count?: number; error?: string };
      if (res.ok) {
        setBulkNotice(`${(data.count ?? count).toLocaleString()} drama(s) deleted.`);
        clearSelection();
        resetPager();
        fetchDramas();
      } else {
        setBulkNotice(data.error || "Couldn't delete the dramas. Please try again.");
      }
    } catch {
      setBulkNotice("Couldn't reach the server. Please try again.");
    } finally {
      setBulkLoading(false);
    }
  };

  // Bulk Publish / Unpublish
  const handleBulkPublish = async (publish: boolean) => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/dramas/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: publish ? "publish" : "unpublish",
          dramaIds: selectedIds,
        }),
      });
      if (res.ok) {
        setSelectedIds([]);
        fetchDramas();
      }
    } catch (err) {
      console.error("Bulk action failed", err);
    } finally {
      setBulkLoading(false);
    }
  };

  // Bulk Publish All with playable episodes
  const handlePublishAllWithEpisodes = async () => {
    if (!confirm("Are you sure you want to publish all dramas that have episodes?")) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/dramas/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish",
          all: true,
          onlyWithEpisodes: true,
        }),
      });
      if (res.ok) {
        fetchDramas();
      }
    } catch (err) {
      console.error("Bulk publish failed", err);
    } finally {
      setBulkLoading(false);
    }
  };

  // Single 1-Click Publish Toggle
  const toggleSinglePublish = async (drama: DramaCard, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const newStatus = !drama.isPublished;
      const res = await fetch(`/api/admin/dramas/${drama.dramaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: newStatus }),
      });
      if (res.ok) {
        setDramas((prev) =>
          prev.map((d) =>
            d.dramaId === drama.dramaId ? { ...d, isPublished: newStatus } : d
          )
        );
      }
    } catch (err) {
      console.error("Failed to toggle publish status", err);
    }
  };

  // Drama Modal Openers
  const openCreateDramaModal = () => {
    setEditingDrama(null);
    setDramaError("");
    setCoverFolder(null);
    setCoverPreview(null);
    setFolderSuffix(Math.random().toString(36).slice(2, 8).padEnd(6, "0"));
    setDramaForm({
      title: "",
      cover: "",
      synopsis: "",
      tags: "",
      playCount: 0,
      likeCount: 0,
      isPublished: false,
    });
    setIsDramaModalOpen(true);
  };

  const openEditDramaModal = async (drama: DramaCard) => {
    setEditingDrama(drama);
    setDramaError("");
    setCoverPreview(drama.previewCover ?? null);
    try {
      const res = await fetch(`/api/admin/dramas/${drama.dramaId}`);
      if (res.ok) {
        const detail = await res.json();
        if (detail.previewCover) setCoverPreview(detail.previewCover);
        setDramaForm({
          title: detail.title || "",
          cover: detail.cover || "",
          synopsis: detail.synopsis || "",
          tags: Array.isArray(detail.tags) ? detail.tags.join(", ") : "",
          playCount: detail.playCount || 0,
          likeCount: detail.likeCount || 0,
          isPublished: Boolean(detail.isPublished),
        });
      }
    } catch {
      setDramaForm({
        title: drama.title || "",
        cover: drama.cover || "",
        synopsis: "",
        tags: "",
        playCount: drama.playCount || 0,
        likeCount: 0,
        isPublished: Boolean(drama.isPublished),
      });
    }
    setIsDramaModalOpen(true);
  };

  const handleSaveDrama = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dramaForm.title.trim()) return;
    setSubmittingDrama(true);

    try {
      const url = editingDrama
        ? `/api/admin/dramas/${editingDrama.dramaId}`
        : `/api/admin/dramas`;
      const method = editingDrama ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...dramaForm,
          tags: dramaForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
          // Keep the new drama's files in the folder its cover was uploaded to.
          ...(editingDrama ? {} : { storageFolder: coverFolder }),
        }),
      });

      if (res.ok) {
        setIsDramaModalOpen(false);
        fetchDramas();
      } else {
        const data = await res.json().catch(() => ({}));
        setDramaError(data.error || "Could not save the drama.");
      }
    } catch (err) {
      console.error("Failed to save drama", err);
      setDramaError("Could not save the drama. Check your connection and try again.");
    } finally {
      setSubmittingDrama(false);
    }
  };

  const handleDeleteDrama = async (dramaId: number) => {
    if (
      !confirm(
        isAdmin
          ? "Are you sure you want to delete this drama and all its episodes? Linked reels are deleted too."
          : "Delete this drama and all its episodes? Your reels linked to it are deleted too; other people's reels are only unlinked."
      )
    )
      return;
    try {
      const res = await fetch(`/api/admin/dramas/${dramaId}`, { method: "DELETE" });
      if (res.ok) {
        fetchDramas();
      } else {
        const data = await res.json().catch(() => ({}));
        setBulkNotice(data.error || "Could not delete the drama.");
      }
    } catch (err) {
      console.error("Failed to delete drama", err);
    }
  };

  // Episode Management Handlers
  const openEpisodeManager = async (drama: DramaCard) => {
    setCurrentDrama(drama);
    setIsEpisodeModalOpen(true);
    setLoadingEpisodes(true);
    setPreviewStreamUrl(null);

    try {
      const res = await fetch(`/api/admin/dramas/${drama.dramaId}/episodes`);
      if (res.ok) {
        const data = await res.json();
        setEpisodes(data.episodes || []);
        const nextEpNum = (data.episodes?.length || 0) + 1;
        setNewEpisodeForm({ ep: nextEpNum, url: "", isPublished: true });
      }
    } catch (err) {
      console.error("Failed to load episodes", err);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const handleAddEpisode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDrama || !newEpisodeForm.url.trim()) return;

    try {
      const res = await fetch(`/api/admin/dramas/${currentDrama.dramaId}/episodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEpisodeForm),
      });

      if (res.ok) {
        const data = await res.json();
        setEpisodes(data.episodes || []);
        setNewEpisodeForm({
          ep: (data.episodes?.length || 0) + 1,
          url: "",
          isPublished: true,
        });
      }
    } catch (err) {
      console.error("Failed to add episode", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
            <Tv2 className="w-6 h-6 text-rose-500" /> Drama Series Management
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Browse, review, edit, and publish drama titles from the catalog.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
          <button
            onClick={handlePublishAllWithEpisodes}
            disabled={bulkLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1e293b] hover:bg-[#334155] border border-slate-700 text-slate-200 text-xs font-semibold transition"
            title="Publish all dramas having playable episodes"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Publish All with Episodes
          </button>
          )}

          <button
            onClick={openCreateDramaModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all"
          >
            <Plus className="w-4 h-4" /> Add Drama
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-[#0f141f] border border-[#1a2333]">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by title, synopsis, or drama ID..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              resetPager();
            }}
            className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-rose-500 transition"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-[#161c28] p-1 rounded-xl border border-[#222c3f]">
          {(["all", "published", "draft"] as const).map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                resetPager();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                statusFilter === st
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {st}
            </button>
          ))}
          <button
            onClick={() => {
              setMineOnly((v) => !v);
              resetPager();
            }}
            aria-pressed={mineOnly}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              mineOnly ? "bg-rose-600 text-white shadow-sm" : "text-neutral-400 hover:text-white"
            }`}
          >
            Mine
          </button>
        </div>
      </div>

      {bulkNotice && (
        <div role="status" className="flex items-center justify-between rounded-xl border border-[#2b3850] bg-[#121a29] px-4 py-3 text-xs text-neutral-100">
          {bulkNotice}
          <button onClick={() => setBulkNotice("")} className="text-neutral-400 hover:text-white" aria-label="Dismiss message">
            ✕
          </button>
        </div>
      )}

      {/* Bulk Action Bar (when items selected) */}
      {isAdmin && (allMatching || selectedIds.length > 0) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs animate-in fade-in duration-200">
          <div>
            {allMatching ? (
              <>
                <span className="font-bold text-white">{selectedCount.toLocaleString()}</span> of {total.toLocaleString()} dramas selected
                {excludedIds.length > 0 ? ` (keeping ${excludedIds.length})` : ""}
                <span className="block text-[11px] text-rose-200/80">Untick any drama, on any page, to keep it.</span>
              </>
            ) : (
              <>
                <span className="font-bold text-white">{selectedIds.length}</span> dramas selected
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!allMatching && (
              <>
            <button
              onClick={() => handleBulkPublish(true)}
              disabled={bulkLoading}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 transition"
            >
              <Globe className="w-3.5 h-3.5" /> Publish Selected
            </button>
            <button
              onClick={() => handleBulkPublish(false)}
              disabled={bulkLoading}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center gap-1.5 transition"
            >
              <EyeOff className="w-3.5 h-3.5" /> Unpublish Selected
            </button>
              </>
            )}
            <button
              onClick={handleBulkDelete}
              disabled={bulkLoading}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {allMatching ? `Delete ${selectedCount.toLocaleString()}` : "Delete Selected"}
            </button>
            <button
              onClick={clearSelection}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold transition"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Total Counter and Select All */}
      <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
        <div className="flex items-center gap-3">
          {isAdmin && (
          <>
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 hover:text-white transition font-medium"
          >
            {pageAllChecked ? (
              <CheckSquare className="w-4 h-4 text-rose-500" />
            ) : (
              <Square className="w-4 h-4 text-neutral-500" />
            )}
            Select Page
          </button>
          {total > 0 && !allMatching && (
            <button
              onClick={selectAllMatching}
              className="font-semibold text-rose-300 underline underline-offset-2 hover:text-white transition"
            >
              Select all {total.toLocaleString()} dramas{statusFilter !== "all" || searchQuery ? " in this view" : ""}
            </button>
          )}
          </>
          )}
          <span>Showing {dramas.length} of {total.toLocaleString()} dramas</span>
        </div>
      </div>

      {/* Dramas Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-neutral-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-rose-500" /> Loading catalog...
        </div>
      ) : dramas.length === 0 ? (
        <div className="text-center py-20 bg-[#0f141f] rounded-2xl border border-[#1a2333] space-y-3">
          <Tv2 className="w-10 h-10 text-neutral-600 mx-auto" />
          <p className="text-sm font-semibold text-neutral-400">No dramas found</p>
          <p className="text-xs text-neutral-600">Try changing your search query or filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {dramas.map((drama) => {
            const isSelected = isChecked(drama.dramaId);
            const editable = canChange(drama);
            return (
              <div
                key={drama.dramaId}
                className={`group relative rounded-2xl bg-[#0f141f] border overflow-hidden flex flex-col justify-between transition-all ${
                  isSelected
                    ? "border-rose-500 ring-2 ring-rose-500/20"
                    : "border-[#1a2333] hover:border-slate-600"
                }`}
              >
                {/* Poster Box */}
                <div className="relative aspect-[3/4] bg-[#161c28] overflow-hidden">
                  {drama.previewCover || drama.cover ? (
                    <Image
                      src={(drama.previewCover || drama.cover)!}
                      alt={drama.title || "Drama Cover"}
                      fill
                      unoptimized
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-600">
                      <Tv2 className="w-8 h-8" />
                    </div>
                  )}

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#090b10] via-transparent to-black/40" />

                  {/* Top Left Selection Checkbox */}
                  {isAdmin && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelectDrama(drama.dramaId);
                    }}
                    className="absolute top-2 left-2 w-6 h-6 rounded-md bg-black/60 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-rose-500" />
                    ) : (
                      <Square className="w-4 h-4 text-neutral-400" />
                    )}
                  </button>
                  )}

                  {/* Top Right Published Badge / Toggle */}
                  <button
                    onClick={(e) => editable && toggleSinglePublish(drama, e)}
                    disabled={!editable}
                    className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md flex items-center gap-1 transition ${
                      drama.isPublished
                        ? "bg-emerald-500/80 text-white hover:bg-emerald-600 shadow-sm"
                        : "bg-amber-500/80 text-black hover:bg-amber-600"
                    }`}
                    title={editable ? "Click to toggle publish status" : drama.isPublished ? "Published" : "Draft"}
                  >
                    {drama.isPublished ? (
                      <>
                        <CheckCircle2 className="w-2.5 h-2.5" /> Published
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-2.5 h-2.5" /> Draft
                      </>
                    )}
                  </button>

                  {/* Bottom Stats Badge */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] text-neutral-300 font-semibold">
                    <span className="bg-black/60 px-2 py-0.5 rounded-md backdrop-blur-sm">
                      {drama.episodeCount} eps
                    </span>
                    <span className="bg-black/60 px-2 py-0.5 rounded-md backdrop-blur-sm">
                      ID: {drama.dramaId}
                    </span>
                  </div>
                </div>

                {/* Info & Action Footer */}
                <div className="p-3 space-y-2.5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white line-clamp-2 leading-snug">
                      {drama.title || "Untitled Drama"}
                    </h3>
                    {drama.createdByName && drama.createdById !== "admin" && (
                      <p className="mt-0.5 truncate text-[10px] text-neutral-500">by {drama.createdByName}</p>
                    )}
                  </div>

                  {!editable ? (
                    <p className="pt-2 border-t border-[#1a2333] text-center text-[10px] text-neutral-500">View only</p>
                  ) : (
                  <div className="grid grid-cols-3 gap-1 pt-1 border-t border-[#1a2333]">
                    <button
                      onClick={() => openEpisodeManager(drama)}
                      className="flex items-center justify-center p-2 rounded-lg bg-[#161c28] hover:bg-[#222c3f] text-slate-300 hover:text-white transition"
                      title="Manage Episodes"
                    >
                      <ListVideo className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openEditDramaModal(drama)}
                      className="flex items-center justify-center p-2 rounded-lg bg-[#161c28] hover:bg-[#222c3f] text-cyan-400 hover:text-cyan-300 transition"
                      title="Edit Drama"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteDrama(drama.dramaId)}
                      className="flex items-center justify-center p-2 rounded-lg bg-[#161c28] hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition"
                      title="Delete Drama"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Footer */}
      {(pager.hasPrev || pager.hasNext) && (
        <div className="flex items-center justify-center gap-3 pt-6">
          <button
            onClick={pager.prev}
            disabled={!pager.hasPrev || loading}
            className="px-4 py-2 rounded-xl bg-[#161c28] border border-[#222c3f] text-xs font-semibold text-white disabled:opacity-40 hover:bg-[#222c3f] transition"
          >
            Previous
          </button>
          <span className="text-xs text-neutral-400 font-mono">
            Page {pager.page} of {Math.max(1, Math.ceil(total / limit))}
          </span>
          <button
            onClick={pager.next}
            disabled={!pager.hasNext || loading}
            className="px-4 py-2 rounded-xl bg-[#161c28] border border-[#222c3f] text-xs font-semibold text-white disabled:opacity-40 hover:bg-[#222c3f] transition"
          >
            Next
          </button>
        </div>
      )}

      {/* Drama Create / Edit Modal */}
      {isDramaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl bg-[#0f141f] border border-[#222c3f] shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#1a2333] pb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Tv2 className="w-4 h-4 text-rose-500" />
                {editingDrama ? "Edit Drama Series" : "Create New Drama"}
              </h2>
              <button
                onClick={() => setIsDramaModalOpen(false)}
                className="text-neutral-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDrama} className="space-y-4">
              {dramaError && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-100">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {dramaError}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Title</label>
                <input
                  type="text"
                  required
                  value={dramaForm.title}
                  onChange={(e) => setDramaForm({ ...dramaForm, title: e.target.value })}
                  placeholder="e.g. Master of the Shadows"
                  className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-300">Cover Image URL</label>
                  <button
                    type="button"
                    onClick={() => setShowCoverUploader(!showCoverUploader)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    {showCoverUploader ? "Hide Uploader" : "B2 Cloud Uploader (Progress & Resumable)"}
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={dramaForm.cover}
                    onChange={(e) => {
                      setDramaForm({ ...dramaForm, cover: e.target.value });
                      setCoverPreview(e.target.value || null);
                    }}
                    placeholder="https://images.unsplash.com/... or upload to B2"
                    className="flex-1 bg-[#161c28] border border-[#222c3f] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCoverUploader(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#222c3f] hover:bg-[#2e3b52] text-white text-xs font-semibold transition whitespace-nowrap"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-rose-400" />
                    Upload File / Folder
                  </button>
                </div>

                {coverPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverPreview}
                    alt="Cover preview"
                    className="h-40 w-auto rounded-xl border border-[#222c3f] object-cover"
                    onError={() => setCoverPreview(null)}
                  />
                )}

                {showCoverUploader && (
                  <div className="p-3.5 rounded-2xl bg-[#0f1422] border border-[#1f2a40] space-y-3">
                    <FileUploadManager
                      folderType="dramas"
                      // Existing drama: its own folder (decided by the server). New drama:
                      // a folder named after the title; the drama keeps using it once created.
                      dramaId={editingDrama?.dramaId}
                      targetName={coverFolder || newDramaFolder(dramaForm.title, folderSuffix)}
                      accept="image/*"
                      compact={true}
                      onFileUploaded={(result) => {
                        if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(result.fileName) || result.file.type.startsWith("image/")) {
                          setDramaForm((prev) => ({ ...prev, cover: result.url }));
                          setCoverPreview(URL.createObjectURL(result.file));
                          if (!editingDrama) setCoverFolder((prev) => prev || newDramaFolder(dramaForm.title, folderSuffix));
                        }
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Synopsis / Description</label>
                <textarea
                  rows={3}
                  value={dramaForm.synopsis}
                  onChange={(e) => setDramaForm({ ...dramaForm, synopsis: e.target.value })}
                  placeholder="Brief synopsis of the drama plot..."
                  className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={dramaForm.tags}
                  onChange={(e) => setDramaForm({ ...dramaForm, tags: e.target.value })}
                  placeholder="Romance, Billionaire, Action, Revenge"
                  className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Published Checkbox Toggle */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#161c28] border border-[#222c3f]">
                <input
                  type="checkbox"
                  id="modal-published"
                  checked={dramaForm.isPublished}
                  onChange={(e) => setDramaForm({ ...dramaForm, isPublished: e.target.checked })}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                />
                <label htmlFor="modal-published" className="text-xs font-semibold text-white cursor-pointer select-none">
                  Published (Live in Public API & Mobile App)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1a2333]">
                <button
                  type="button"
                  onClick={() => setIsDramaModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#161c28] text-xs font-semibold text-neutral-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDrama}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-xs font-bold text-white shadow-lg shadow-rose-600/30 disabled:opacity-50"
                >
                  {submittingDrama ? "Saving..." : editingDrama ? "Update Drama" : "Create Drama"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Episode Manager Modal */}
      {isEpisodeModalOpen && currentDrama && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-[#0f141f] border border-[#222c3f] shadow-2xl p-6 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#1a2333] pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <ListVideo className="w-4 h-4 text-rose-500" /> Episode Manager
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">{currentDrama.title}</p>
              </div>
              <button
                onClick={() => setIsEpisodeModalOpen(false)}
                className="text-neutral-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Stream Preview Player */}
            {previewStreamUrl && (
              <div className="rounded-xl overflow-hidden bg-black border border-rose-500/30 p-2 space-y-2">
                <div className="flex items-center justify-between text-xs text-rose-300 font-semibold px-2">
                  <span>Stream Player Preview</span>
                  <button onClick={() => setPreviewStreamUrl(null)} className="hover:text-white">
                    Close Preview
                  </button>
                </div>
                <video
                  src={previewStreamUrl}
                  controls
                  autoPlay
                  className="w-full max-h-60 rounded-lg object-contain bg-neutral-950"
                />
              </div>
            )}

            {/* Upload many episode files at once (each drama has its own bucket folder) */}
            <div className="flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-neutral-300">
                Upload episode videos straight to storage, several at once. Numbers are read from the file names.
              </p>
              <button
                type="button"
                onClick={() => setShowEpisodeUploader(true)}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              >
                <UploadCloud className="h-4 w-4" /> Upload episodes
              </button>
            </div>
            <EpisodeUploadDialog
              open={showEpisodeUploader}
              drama={{ dramaId: currentDrama.dramaId, title: currentDrama.title }}
              existing={episodes}
              onClose={() => setShowEpisodeUploader(false)}
              onSaved={(eps) => {
                setEpisodes(eps);
                setNewEpisodeForm((prev) => ({ ...prev, ep: (eps.length ? Math.max(...eps.map((e) => e.ep)) : 0) + 1 }));
                setDramas((prev) => prev.map((d) => (d.dramaId === currentDrama.dramaId ? { ...d, episodeCount: eps.length } : d)));
              }}
            />

            {/* Add New Episode Form */}
            <form onSubmit={handleAddEpisode} className="flex flex-col sm:flex-row gap-3 p-4 rounded-xl bg-[#161c28] border border-[#222c3f]">
              <div className="w-24">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                  EP #
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={newEpisodeForm.ep}
                  onChange={(e) => setNewEpisodeForm({ ...newEpisodeForm, ep: Number(e.target.value) })}
                  className="w-full bg-[#0f141f] border border-[#2a374f] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    Or paste a video URL (.m3u8 / .mp4)
                  </label>
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    required
                    value={newEpisodeForm.url}
                    onChange={(e) => setNewEpisodeForm({ ...newEpisodeForm, url: e.target.value })}
                    placeholder="https://stream.example.com/drama/ep1.m3u8 or upload video"
                    className="flex-1 bg-[#0f141f] border border-[#2a374f] rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder:text-neutral-600"
                  />
                </div>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition whitespace-nowrap"
                >
                  Save Episode
                </button>
              </div>
            </form>

            {/* Episodes List */}
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {loadingEpisodes ? (
                <div className="py-8 text-center text-xs text-neutral-500 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-rose-500" /> Loading episodes...
                </div>
              ) : (
                <EpisodeList
                  dramaId={currentDrama.dramaId}
                  episodes={episodes}
                  onPreview={(url) => setPreviewStreamUrl(url)}
                  onChange={(eps) => {
                    setEpisodes(eps);
                    setDramas((prev) =>
                      prev.map((d) => (d.dramaId === currentDrama.dramaId ? { ...d, episodeCount: eps.length } : d))
                    );
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
