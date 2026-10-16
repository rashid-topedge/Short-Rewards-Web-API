"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Search,
  Plus,
  Video,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Play,
  X,
  Loader2,
  CheckSquare,
  Square,
  Globe,
  EyeOff,
  Tv2,
  Clock,
  Heart,
  Eye,
} from "lucide-react";
import type { ReelItem } from "@/lib/types";

export default function AdminReelsPage() {
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  // Selection
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Video Preview Player
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

  // Reel Create / Edit Modal
  const [isReelModalOpen, setIsReelModalOpen] = useState(false);
  const [editingReel, setEditingReel] = useState<ReelItem | null>(null);
  const [reelForm, setReelForm] = useState({
    title: "",
    synopsis: "",
    videoUrl: "",
    thumbnailUrl: "",
    durationSeconds: 60,
    dramaId: "" as string | number,
    episodeNumber: "" as string | number,
    tags: "",
    isPublished: false,
  });
  const [submittingReel, setSubmittingReel] = useState(false);
  const [folderFiles, setFolderFiles] = useState<FileList | null>(null);
  const [uploadingFolder, setUploadingFolder] = useState(false);

  const fetchReels = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery,
        status: statusFilter,
        limit: String(limit),
        offset: String(offset),
      });
      const res = await fetch(`/api/admin/reels?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReels(data.items || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to load reels", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, offset]);

  useEffect(() => {
    fetchReels();
  }, [fetchReels]);

  // Bulk Selection Handlers
  const toggleSelectAll = () => {
    if (selectedIds.length === reels.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(reels.map((r) => r.reelId));
    }
  };

  const toggleSelectReel = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Bulk Publish / Unpublish
  const handleBulkPublish = async (publish: boolean) => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/reels/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: publish ? "publish" : "unpublish",
          reelIds: selectedIds,
        }),
      });
      if (res.ok) {
        setSelectedIds([]);
        fetchReels();
      }
    } catch (err) {
      console.error("Bulk reels action failed", err);
    } finally {
      setBulkLoading(false);
    }
  };

  // 1-Click Toggle Publish
  const toggleSinglePublish = async (reel: ReelItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const newStatus = !reel.isPublished;
      const res = await fetch(`/api/admin/reels/${reel.reelId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: newStatus }),
      });
      if (res.ok) {
        setReels((prev) =>
          prev.map((r) =>
            r.reelId === reel.reelId ? { ...r, isPublished: newStatus } : r
          )
        );
      }
    } catch (err) {
      console.error("Failed to toggle reel publish status", err);
    }
  };

  // Modal Openers
  const openCreateReelModal = () => {
    setEditingReel(null);
    setReelForm({
      title: "",
      synopsis: "",
      videoUrl: "",
      thumbnailUrl: "",
      durationSeconds: 45,
      dramaId: "",
      episodeNumber: "",
      tags: "Trending, Highlight, Short",
      isPublished: true,
    });
    setIsReelModalOpen(true);
  };

  const openEditReelModal = (reel: ReelItem) => {
    setEditingReel(reel);
    setReelForm({
      title: reel.title || "",
      synopsis: reel.synopsis || "",
      videoUrl: reel.videoUrl || "",
      thumbnailUrl: reel.thumbnailUrl || "",
      durationSeconds: reel.durationSeconds || 45,
      dramaId: reel.dramaId ? String(reel.dramaId) : "",
      episodeNumber: reel.episodeNumber ? String(reel.episodeNumber) : "",
      tags: Array.isArray(reel.tags) ? reel.tags.join(", ") : "",
      isPublished: Boolean(reel.isPublished),
    });
    setIsReelModalOpen(true);
  };

  const handleSaveReel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reelForm.title.trim() || !reelForm.videoUrl.trim()) return;
    setSubmittingReel(true);

    try {
      const url = editingReel
        ? `/api/admin/reels/${editingReel.reelId}`
        : `/api/admin/reels`;
      const method = editingReel ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...reelForm,
          dramaId: reelForm.dramaId ? Number(reelForm.dramaId) : null,
          episodeNumber: reelForm.episodeNumber ? Number(reelForm.episodeNumber) : null,
          tags: reelForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });

      if (res.ok) {
        setIsReelModalOpen(false);
        fetchReels();
      }
    } catch (err) {
      console.error("Failed to save reel", err);
    } finally {
      setSubmittingReel(false);
    }
  };

  const handleDeleteReel = async (reelId: number) => {
    if (!confirm("Are you sure you want to delete this short reel?")) return;
    try {
      const res = await fetch(`/api/admin/reels/${reelId}`, { method: "DELETE" });
      if (res.ok) {
        fetchReels();
      }
    } catch (err) {
      console.error("Failed to delete reel", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
            <Video className="w-6 h-6 text-purple-400" /> Short Reels & Vertical Videos
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Manage viral short clips, drama highlights, and publish vertical video streams.
          </p>
        </div>

        <button
          onClick={openCreateReelModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all"
        >
          <Plus className="w-4 h-4" /> Add Short Reel
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-[#0f141f] border border-[#1a2333]">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search reels by title, drama link, or tags..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setOffset(0);
            }}
            className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-purple-500 transition"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5 bg-[#161c28] p-1 rounded-xl border border-[#222c3f]">
          {(["all", "published", "draft"] as const).map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setOffset(0);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                statusFilter === st
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-purple-950/40 border border-purple-500/40 text-purple-200 text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">{selectedIds.length}</span> reels selected
          </div>
          <div className="flex items-center gap-2">
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
            <button
              onClick={() => setSelectedIds([])}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold transition"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Counter and Select All */}
      <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 hover:text-white transition font-medium"
          >
            {selectedIds.length === reels.length && reels.length > 0 ? (
              <CheckSquare className="w-4 h-4 text-purple-500" />
            ) : (
              <Square className="w-4 h-4 text-neutral-500" />
            )}
            Select Page
          </button>
          <span>Showing {reels.length} of {total.toLocaleString()} short reels</span>
        </div>
      </div>

      {/* Reels Grid (9:16 aspect ratio vertical cards) */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-neutral-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-purple-500" /> Loading short reels...
        </div>
      ) : reels.length === 0 ? (
        <div className="text-center py-20 bg-[#0f141f] rounded-2xl border border-[#1a2333] space-y-3">
          <Video className="w-10 h-10 text-neutral-600 mx-auto" />
          <p className="text-sm font-semibold text-neutral-400">No short reels found</p>
          <p className="text-xs text-neutral-600">Click &quot;Add Short Reel&quot; to publish your first short video</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {reels.map((reel) => {
            const isSelected = selectedIds.includes(reel.reelId);
            return (
              <div
                key={reel.reelId}
                className={`group relative rounded-2xl bg-[#0f141f] border overflow-hidden flex flex-col justify-between transition-all ${
                  isSelected
                    ? "border-purple-500 ring-2 ring-purple-500/20"
                    : "border-[#1a2333] hover:border-slate-600"
                }`}
              >
                {/* 9:16 Thumbnail Container */}
                <div className="relative aspect-[9/14] bg-[#161c28] overflow-hidden">
                  {reel.thumbnailUrl ? (
                    <Image
                      src={reel.thumbnailUrl}
                      alt={reel.title}
                      fill
                      unoptimized
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-neutral-600 gap-1 p-2 text-center">
                      <Video className="w-8 h-8 text-neutral-500" />
                      <span className="text-[10px] text-neutral-500 line-clamp-2">{reel.title}</span>
                    </div>
                  )}

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#090b10] via-transparent to-black/40" />

                  {/* Top Left Selection Checkbox */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelectReel(reel.reelId);
                    }}
                    className="absolute top-2 left-2 w-6 h-6 rounded-md bg-black/60 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-purple-500" />
                    ) : (
                      <Square className="w-4 h-4 text-neutral-400" />
                    )}
                  </button>

                  {/* Top Right Published Toggle Badge */}
                  <button
                    onClick={(e) => toggleSinglePublish(reel, e)}
                    className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md flex items-center gap-1 transition ${
                      reel.isPublished
                        ? "bg-emerald-500/80 text-white hover:bg-emerald-600 shadow-sm"
                        : "bg-amber-500/80 text-black hover:bg-amber-600"
                    }`}
                    title="Click to toggle publish status"
                  >
                    {reel.isPublished ? (
                      <>
                        <CheckCircle2 className="w-2.5 h-2.5" /> Live
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-2.5 h-2.5" /> Draft
                      </>
                    )}
                  </button>

                  {/* Play Button Overlay */}
                  <button
                    onClick={() => setPreviewVideoUrl(reel.videoUrl)}
                    className="absolute inset-0 flex items-center justify-center m-auto w-12 h-12 rounded-full bg-purple-600/80 hover:bg-purple-500 text-white backdrop-blur-md transition-all scale-90 group-hover:scale-100 shadow-xl"
                    title="Play Reel"
                  >
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                  </button>

                  {/* Bottom Stats Badge on Video Card */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] text-neutral-300 font-semibold">
                    <span className="bg-black/60 px-2 py-0.5 rounded-md backdrop-blur-sm flex items-center gap-1">
                      <Clock className="w-3 h-3 text-purple-400" /> {reel.durationSeconds}s
                    </span>
                    <span className="bg-black/60 px-2 py-0.5 rounded-md backdrop-blur-sm flex items-center gap-1">
                      <Heart className="w-3 h-3 text-rose-400" /> {reel.likeCount}
                    </span>
                  </div>
                </div>

                {/* Info & Action Footer */}
                <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white line-clamp-2 leading-snug">
                      {reel.title}
                    </h3>

                    {reel.dramaTitle && (
                      <p className="text-[10px] text-purple-400 font-semibold truncate flex items-center gap-1 mt-1">
                        <Tv2 className="w-3 h-3 shrink-0" /> {reel.dramaTitle}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#1a2333]">
                    <div className="flex items-center gap-1 text-[10px] text-neutral-400">
                      <Eye className="w-3 h-3" /> {reel.viewCount} views
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditReelModal(reel)}
                        className="p-1.5 rounded-lg bg-[#161c28] hover:bg-[#222c3f] text-cyan-400 hover:text-cyan-300 transition"
                        title="Edit Reel"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteReel(reel.reelId)}
                        className="p-1.5 rounded-lg bg-[#161c28] hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition"
                        title="Delete Reel"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Video Preview Modal */}
      {previewVideoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden bg-black border border-purple-500/40 shadow-2xl p-2 space-y-2">
            <div className="flex items-center justify-between text-xs text-purple-300 font-semibold px-2">
              <span>Reel Video Preview</span>
              <button
                onClick={() => setPreviewVideoUrl(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <video
              src={previewVideoUrl}
              controls
              autoPlay
              className="w-full aspect-[9/16] rounded-xl object-contain bg-black"
            />
          </div>
        </div>
      )}

      {/* Reel Create / Edit Modal */}
      {isReelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl bg-[#0f141f] border border-[#222c3f] shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#1a2333] pb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Video className="w-4 h-4 text-purple-400" />
                {editingReel ? "Edit Short Reel" : "Create New Short Reel"}
              </h2>
              <button
                onClick={() => setIsReelModalOpen(false)}
                className="text-neutral-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReel} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Reel Title</label>
                <input
                  type="text"
                  required
                  value={reelForm.title}
                  onChange={(e) => setReelForm({ ...reelForm, title: e.target.value })}
                  placeholder="e.g. He Revealed His True Identity!"
                  className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Video Stream URL (.m3u8 / .mp4) or Folder Upload</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={reelForm.videoUrl}
                    onChange={(e) => setReelForm({ ...reelForm, videoUrl: e.target.value })}
                    placeholder="https://stream.example.com/reels/clip1.m3u8"
                    className="flex-1 bg-[#161c28] border border-[#222c3f] rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#222c3f] hover:bg-[#2e3b52] text-white text-xs font-semibold transition whitespace-nowrap">
                    <span>{uploadingFolder ? "Uploading..." : "Select Folder"}</span>
                    <input
                      type="file"
                      // @ts-expect-error webkitdirectory
                      webkitdirectory=""
                      directory=""
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0) return;
                        setUploadingFolder(true);
                        try {
                          const formData = new FormData();
                          formData.append("folderType", "reels");
                          const slug = reelForm.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `reel_${Date.now()}`;
                          formData.append("targetName", slug);
                          for (let i = 0; i < files.length; i++) formData.append("files", files[i]);
                          const res = await fetch("/api/admin/upload-folder", { method: "POST", body: formData });
                          if (res.ok) {
                            const data = await res.json();
                            const videoEntry = Object.entries(data.urls || {}).find(([k]) => /\.(mp4|m3u8|webm|mov)$/i.test(k));
                            const thumbEntry = Object.entries(data.urls || {}).find(([k]) => /\.(jpg|jpeg|png|webp)$/i.test(k));
                            const updates: Partial<typeof reelForm> = {};
                            if (videoEntry) updates.videoUrl = videoEntry[1];
                            if (thumbEntry) updates.thumbnailUrl = thumbEntry[1];
                            if (Object.keys(updates).length > 0) setReelForm(prev => ({ ...prev, ...updates }));
                          }
                        } catch (err) { console.error("Reel folder upload error", err); }
                        finally { setUploadingFolder(false); }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Thumbnail / Poster URL (Optional)</label>
                <input
                  type="url"
                  value={reelForm.thumbnailUrl}
                  onChange={(e) => setReelForm({ ...reelForm, thumbnailUrl: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300">Duration (sec)</label>
                  <input
                    type="number"
                    min={5}
                    value={reelForm.durationSeconds}
                    onChange={(e) => setReelForm({ ...reelForm, durationSeconds: Number(e.target.value) })}
                    className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3.5 py-2 text-xs text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300">Linked Drama ID</label>
                  <input
                    type="number"
                    value={reelForm.dramaId}
                    onChange={(e) => setReelForm({ ...reelForm, dramaId: e.target.value })}
                    placeholder="e.g. 11917"
                    className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3.5 py-2 text-xs text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300">Episode #</label>
                  <input
                    type="number"
                    value={reelForm.episodeNumber}
                    onChange={(e) => setReelForm({ ...reelForm, episodeNumber: e.target.value })}
                    placeholder="e.g. 1"
                    className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3.5 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Synopsis / Caption</label>
                <textarea
                  rows={2}
                  value={reelForm.synopsis}
                  onChange={(e) => setReelForm({ ...reelForm, synopsis: e.target.value })}
                  placeholder="Short description or hooks for viewers..."
                  className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Published Checkbox */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#161c28] border border-[#222c3f]">
                <input
                  type="checkbox"
                  id="modal-reel-published"
                  checked={reelForm.isPublished}
                  onChange={(e) => setReelForm({ ...reelForm, isPublished: e.target.checked })}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                />
                <label htmlFor="modal-reel-published" className="text-xs font-semibold text-white cursor-pointer select-none">
                  Published (Live in Public Reels Feed & App)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1a2333]">
                <button
                  type="button"
                  onClick={() => setIsReelModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#161c28] text-xs font-semibold text-neutral-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReel}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-bold text-white shadow-lg shadow-purple-600/30 disabled:opacity-50"
                >
                  {submittingReel ? "Saving..." : editingReel ? "Update Reel" : "Create Reel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
