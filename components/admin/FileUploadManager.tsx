"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  UploadCloud,
  FileVideo,
  FileImage,
  FileText,
  File as FileGeneric,
  CheckCircle2,
  AlertCircle,
  Pause,
  Play,
  RotateCcw,
  X,
  FolderUp,
  HardDrive,
  Cloud,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { ChunkSender, UploadAbortedError } from "@/lib/chunkUpload";

export type FolderType = "dramas" | "reels" | "payouts";

export interface UploadItem {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  folderType: FolderType;
  targetName: string;
  sessionId?: string;
  totalChunks: number;
  chunkSize: number;
  uploadedChunks: number[];
  progress: number; // 0 - 100
  bytesUploaded: number;
  status: "idle" | "uploading" | "paused" | "completed" | "failed";
  speed: string; // e.g. "2.4 MB/s"
  error?: string;
  url?: string;
  storage?: "b2" | "local";
  /** Aborts the chunk in flight (pause/remove). */
  activeXhr?: { abort(): void };
  startTime?: number;
  lastProgressTime?: number;
  lastBytesUploaded?: number;
}

interface FileUploadManagerProps {
  folderType: FolderType;
  targetName: string;
  allowFolder?: boolean;
  accept?: string;
  compact?: boolean;
  onFileUploaded?: (result: { fileName: string; url: string; file: File; storage: string }) => void;
  onBatchComplete?: (results: Record<string, string>) => void;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk

export default function FileUploadManager({
  folderType,
  targetName,
  allowFolder = true,
  accept,
  compact = false,
  onFileUploaded,
  onBatchComplete,
}: FileUploadManagerProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [b2Info, setB2Info] = useState<{ isConfigured: boolean; bucketId?: string; loading: boolean }>({
    isConfigured: false,
    loading: true,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<UploadItem[]>([]);
  // One sender per item: remembers whether this session uploads directly to Backblaze.
  const sendersRef = useRef(new Map<string, ChunkSender>());

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Fetch B2 status on mount
  useEffect(() => {
    let isMounted = true;
    fetch("/api/admin/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((settings) => {
        if (!isMounted || !settings) return;
        let isConfigured = false;
        let bucketId: string | undefined = undefined;

        if (folderType === "dramas") {
          isConfigured = Boolean(settings.b2DramasKeyId && settings.b2DramasAppKey && settings.b2DramasBucketId);
          bucketId = settings.b2DramasBucketId;
        } else if (folderType === "reels") {
          isConfigured = Boolean(settings.b2ReelsKeyId && settings.b2ReelsAppKey && settings.b2ReelsBucketId);
          bucketId = settings.b2ReelsBucketId;
        } else if (folderType === "payouts") {
          isConfigured = Boolean(settings.b2PayoutsKeyId && settings.b2PayoutsAppKey && settings.b2PayoutsBucketId);
          bucketId = settings.b2PayoutsBucketId;
        }

        // Global fallback check
        if (!isConfigured && settings.s3AccessKey && settings.s3SecretKey && settings.s3Bucket) {
          isConfigured = true;
          bucketId = settings.s3Bucket;
        }

        setB2Info({ isConfigured, bucketId, loading: false });
      })
      .catch(() => {
        if (isMounted) setB2Info({ isConfigured: false, loading: false });
      });

    return () => {
      isMounted = false;
    };
  }, [folderType]);

  const updateItem = useCallback((id: string, updates: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getFileIcon = (fileName: string, mime: string) => {
    if (mime.startsWith("video/") || /\.(mp4|m3u8|webm|mov|mkv)$/i.test(fileName)) {
      return <FileVideo className="w-5 h-5 text-purple-400 shrink-0" />;
    }
    if (mime.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(fileName)) {
      return <FileImage className="w-5 h-5 text-emerald-400 shrink-0" />;
    }
    if (mime.includes("pdf") || /\.(pdf|txt|doc|docx)$/i.test(fileName)) {
      return <FileText className="w-5 h-5 text-amber-400 shrink-0" />;
    }
    return <FileGeneric className="w-5 h-5 text-neutral-400 shrink-0" />;
  };

  // Upload a single chunk (straight to Backblaze when possible) with progress & abort handle
  const uploadChunk = async (
    item: UploadItem,
    chunkIndex: number,
    chunkBlob: Blob
  ): Promise<{ success: boolean; chunkIndex: number }> => {
    const sender = sendersRef.current.get(item.id);
    if (!sender) throw new Error("Upload session isn't ready. Please retry.");
    const controller = new AbortController();
    updateItem(item.id, { activeXhr: controller });
    try {
      await sender.send(chunkIndex, chunkBlob, (loaded) => {
      const currentItem = itemsRef.current.find((it) => it.id === item.id);
      if (!currentItem || currentItem.status === "paused") return;

      const baseBytes = chunkIndex * item.chunkSize;
      const totalUploadedBytes = Math.min(item.fileSize, baseBytes + loaded);
      const percent = Math.min(99, Math.round((totalUploadedBytes / item.fileSize) * 100));

      // Calculate speed
      const now = Date.now();
      const lastTime = currentItem.lastProgressTime || now;
      const lastBytes = currentItem.lastBytesUploaded || 0;
      const timeDiff = (now - lastTime) / 1000;
      let speedStr = currentItem.speed || "0 KB/s";

      if (timeDiff >= 0.5) {
        const bytesDiff = totalUploadedBytes - lastBytes;
        const bytesPerSec = bytesDiff / timeDiff;
        speedStr = `${formatBytes(bytesPerSec)}/s`;
        updateItem(item.id, {
          progress: percent,
          bytesUploaded: totalUploadedBytes,
          speed: speedStr,
          lastProgressTime: now,
          lastBytesUploaded: totalUploadedBytes,
        });
      } else {
        updateItem(item.id, {
          progress: percent,
          bytesUploaded: totalUploadedBytes,
        });
      }
      }, controller.signal);
      return { success: true, chunkIndex };
    } catch (err) {
      if (err instanceof UploadAbortedError) throw new Error("Upload paused by user");
      throw err;
    }
  };

  // Complete assembly and get final B2 / local URL
  const completeUpload = async (item: UploadItem) => {
    updateItem(item.id, { progress: 99, speed: "Finalizing..." });

    const res = await fetch("/api/admin/upload-chunk/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: item.sessionId }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to finalize upload on server");
    }

    const data = await res.json();
    updateItem(item.id, {
      status: "completed",
      progress: 100,
      bytesUploaded: item.fileSize,
      speed: "Done",
      url: data.url,
      storage: data.storage,
      activeXhr: undefined,
    });

    if (onFileUploaded) {
      onFileUploaded({
        fileName: item.fileName,
        url: data.url,
        file: item.file,
        storage: data.storage,
      });
    }

    // Check if entire batch is complete
    const remaining = itemsRef.current.filter(
      (it) => it.id !== item.id && it.status !== "completed"
    );
    if (remaining.length === 0 && onBatchComplete) {
      const results: Record<string, string> = {};
      itemsRef.current.forEach((it) => {
        if (it.url) results[it.fileName] = it.url;
      });
      results[item.fileName] = data.url;
      onBatchComplete(results);
    }
  };

  // Main upload pipeline for an item
  const startUpload = async (itemToUpload: UploadItem) => {
    let item = itemToUpload;
    updateItem(item.id, { status: "uploading", error: undefined, startTime: Date.now() });

    try {
      // 1. Initialize session if not yet initialized
      if (!item.sessionId) {
        const initRes = await fetch("/api/admin/upload-chunk/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: item.fileName,
            fileSize: item.fileSize,
            folderType: item.folderType,
            targetName: item.targetName || targetName,
            totalChunks: item.totalChunks,
            chunkSize: item.chunkSize,
            mimeType: item.file.type || "application/octet-stream",
          }),
        });

        if (!initRes.ok) {
          const err = await initRes.json().catch(() => ({}));
          throw new Error(err.error || "Failed to initialize upload session");
        }

        const initData = await initRes.json();
        sendersRef.current.set(
          item.id,
          ChunkSender.fromServer(initData.sessionId, item.file.type || "application/octet-stream", initData)
        );
        item = {
          ...item,
          sessionId: initData.sessionId,
          uploadedChunks: initData.uploadedChunks || [],
        };
        updateItem(item.id, {
          sessionId: initData.sessionId,
          uploadedChunks: initData.uploadedChunks || [],
        });
      } else {
        // Query status to verify which chunks are already uploaded
        try {
          const statusRes = await fetch(`/api/admin/upload-chunk/status?sessionId=${item.sessionId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (!sendersRef.current.has(item.id)) {
              sendersRef.current.set(
                item.id,
                ChunkSender.fromServer(item.sessionId!, item.file.type || "application/octet-stream", statusData)
              );
            }
            item = {
              ...item,
              uploadedChunks: statusData.uploadedChunks || item.uploadedChunks,
            };
            updateItem(item.id, { uploadedChunks: item.uploadedChunks });
          }
        } catch {
          // continue with local record
        }
        if (!sendersRef.current.has(item.id)) {
          sendersRef.current.set(
            item.id,
            ChunkSender.fromServer(item.sessionId!, item.file.type || "application/octet-stream", {})
          );
        }
      }

      // 2. Upload missing chunks sequentially
      for (let i = 0; i < item.totalChunks; i++) {
        // Check if paused or cancelled
        const currentItem = itemsRef.current.find((it) => it.id === item.id);
        if (!currentItem || currentItem.status === "paused") {
          return;
        }

        if (item.uploadedChunks.includes(i)) {
          continue;
        }

        const start = i * item.chunkSize;
        const end = Math.min(item.fileSize, start + item.chunkSize);
        const chunkBlob = item.file.slice(start, end);

        await uploadChunk(item, i, chunkBlob);

        item.uploadedChunks = [...item.uploadedChunks, i];
        updateItem(item.id, {
          uploadedChunks: item.uploadedChunks,
        });
      }

      // 3. Finalize
      await completeUpload(item);
    } catch (err: unknown) {
      const currentItem = itemsRef.current.find((it) => it.id === item.id);
      if (currentItem && currentItem.status === "paused") {
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      updateItem(item.id, {
        status: "failed",
        error: msg,
        speed: "Failed",
        activeXhr: undefined,
      });
    }
  };

  const pauseUpload = (id: string) => {
    const item = itemsRef.current.find((it) => it.id === id);
    if (!item) return;

    if (item.activeXhr) {
      item.activeXhr.abort();
    }

    updateItem(id, {
      status: "paused",
      speed: "Paused",
      activeXhr: undefined,
    });
  };

  const resumeUpload = (id: string) => {
    const item = itemsRef.current.find((it) => it.id === id);
    if (!item) return;
    startUpload(item);
  };

  const retryUpload = (id: string) => {
    const item = itemsRef.current.find((it) => it.id === id);
    if (!item) return;
    startUpload(item);
  };

  const removeItem = async (id: string) => {
    const item = itemsRef.current.find((it) => it.id === id);
    if (item?.activeXhr) {
      item.activeXhr.abort();
    }
    if (item?.sessionId && item.status !== "completed") {
      fetch("/api/admin/upload-chunk/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: item.sessionId }),
      }).catch(() => {});
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newItems: UploadItem[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      // Skip hidden / system files
      if (file.name.startsWith(".") || file.name === "Thumbs.db" || file.name === ".DS_Store") {
        continue;
      }

      const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;
      const item: UploadItem = {
        id: `file_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
        file,
        fileName: file.name,
        fileSize: file.size,
        folderType,
        targetName,
        totalChunks,
        chunkSize: CHUNK_SIZE,
        uploadedChunks: [],
        progress: 0,
        bytesUploaded: 0,
        status: "idle",
        speed: "",
      };
      newItems.push(item);
    }

    if (newItems.length === 0) return;

    setItems((prev) => [...prev, ...newItems]);

    // Automatically begin upload for all added items
    newItems.forEach((it) => {
      setTimeout(() => startUpload(it), 50);
    });
  };

  const pauseAll = () => {
    itemsRef.current.forEach((it) => {
      if (it.status === "uploading") {
        pauseUpload(it.id);
      }
    });
  };

  const resumeAll = () => {
    itemsRef.current.forEach((it) => {
      if (it.status === "paused" || it.status === "failed") {
        resumeUpload(it.id);
      }
    });
  };

  const clearCompleted = () => {
    setItems((prev) => prev.filter((it) => it.status !== "completed"));
  };

  // Overall batch statistics
  const totalBytes = items.reduce((acc, it) => acc + it.fileSize, 0);
  const totalUploadedBytes = items.reduce((acc, it) => acc + it.bytesUploaded, 0);
  const overallPercent = totalBytes > 0 ? Math.round((totalUploadedBytes / totalBytes) * 100) : 0;
  const isAnyUploading = items.some((it) => it.status === "uploading");
  const isAnyPaused = items.some((it) => it.status === "paused");

  return (
    <div className="space-y-4">
      {/* Bucket Target & Storage Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#0f1422] border border-[#1b2438] text-xs">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              b2Info.isConfigured ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
            }`}
          />
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase tracking-wider text-neutral-300">
              Bucket: <span className="text-white">{folderType.toUpperCase()}</span>
            </span>
            <span className="text-neutral-500">•</span>
            {b2Info.loading ? (
              <span className="text-neutral-400">Checking credentials...</span>
            ) : b2Info.isConfigured ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                <Cloud className="w-3.5 h-3.5" /> Backblaze B2 Active
                {b2Info.bucketId && (
                  <span className="text-neutral-400 font-mono text-[11px]">({b2Info.bucketId})</span>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-400 font-semibold">
                <HardDrive className="w-3.5 h-3.5" /> Local Storage (B2 keys unconfigured)
              </span>
            )}
          </div>
        </div>

        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition"
        >
          Manage B2 Keys <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
          isDragOver
            ? "border-rose-500 bg-rose-500/10 scale-[1.005]"
            : "border-[#20293d] hover:border-slate-600 bg-[#0d111a]/80"
        } ${compact ? "py-4" : "py-8"}`}
      >
        <div className="max-w-md mx-auto space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/10">
            <UploadCloud className="w-6 h-6 animate-bounce" />
          </div>

          <div className="space-y-1">
            <p className="text-sm font-bold text-white">
              Drag & Drop your files or click to browse
            </p>
            <p className="text-xs text-neutral-400">
              Chunked & resumable upload for large files. Automatic B2 multipart upload.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition-all hover:scale-[1.02]"
            >
              <UploadCloud className="w-3.5 h-3.5" /> Choose Files
            </button>

            {allowFolder && (
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1e2638] hover:bg-[#2b354d] border border-slate-700 text-slate-200 text-xs font-bold transition-all hover:scale-[1.02]"
              >
                <FolderUp className="w-3.5 h-3.5 text-purple-400" /> Choose Folder
              </button>
            )}
          </div>

          {/* Hidden inputs */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={accept}
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {allowFolder && (
            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error webkitdirectory folder attribute
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          )}
        </div>
      </div>

      {/* Batch Overview & Global Controls */}
      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#131926] border border-[#1f293d]">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-white">
                Queue: {items.filter((it) => it.status === "completed").length}/{items.length} completed
              </span>
              <span className="text-neutral-500">•</span>
              <span className="text-xs text-neutral-400 font-mono">
                {formatBytes(totalUploadedBytes)} / {formatBytes(totalBytes)} ({overallPercent}%)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isAnyUploading && (
                <button
                  type="button"
                  onClick={pauseAll}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold transition"
                >
                  <Pause className="w-3 h-3" /> Pause All
                </button>
              )}

              {isAnyPaused && (
                <button
                  type="button"
                  onClick={resumeAll}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition"
                >
                  <Play className="w-3 h-3" /> Resume All
                </button>
              )}

              <button
                type="button"
                onClick={clearCompleted}
                className="px-2.5 py-1.5 rounded-lg bg-[#1e2638] hover:bg-[#2b354d] text-neutral-300 text-xs font-semibold transition"
              >
                Clear Done
              </button>
            </div>
          </div>

          {/* Individual File Cards */}
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-[#0d121c] border border-[#1b2333] hover:border-slate-600 transition space-y-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {getFileIcon(item.fileName, item.file.type)}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">{item.fileName}</p>
                      <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                        <span>{formatBytes(item.fileSize)}</span>
                        <span>•</span>
                        {item.totalChunks > 1 && (
                          <>
                            <span>{item.totalChunks} chunks</span>
                            <span>•</span>
                          </>
                        )}
                        <span className="font-mono text-neutral-300">{item.speed}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Status Badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === "uploading" && (
                      <button
                        type="button"
                        onClick={() => pauseUpload(item.id)}
                        title="Pause upload"
                        className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition"
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {item.status === "paused" && (
                      <button
                        type="button"
                        onClick={() => resumeUpload(item.id)}
                        title="Resume upload"
                        className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {item.status === "failed" && (
                      <button
                        type="button"
                        onClick={() => retryUpload(item.id)}
                        title="Retry upload"
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      title="Remove from queue"
                      className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>

                    {item.status === "completed" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        {item.storage === "b2" ? "B2" : "Local"}
                      </span>
                    )}

                    {item.status === "failed" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[11px] font-bold">
                        <AlertCircle className="w-3 h-3" /> Failed
                      </span>
                    )}

                    {item.status === "paused" && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-bold">
                        Paused
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="w-full bg-[#1b2333] h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        item.status === "completed"
                          ? "bg-emerald-500"
                          : item.status === "failed"
                          ? "bg-rose-500"
                          : item.status === "paused"
                          ? "bg-amber-500"
                          : "bg-gradient-to-r from-rose-500 via-pink-500 to-purple-500 animate-pulse"
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-neutral-400 font-mono">
                    <span>
                      {formatBytes(item.bytesUploaded)} / {formatBytes(item.fileSize)}
                    </span>
                    <span>{item.progress}%</span>
                  </div>
                </div>

                {/* Error Banner if any */}
                {item.error && (
                  <p className="text-[11px] text-rose-400 bg-rose-950/30 p-2 rounded-lg border border-rose-800/40">
                    {item.error}
                  </p>
                )}

                {/* Public URL result preview */}
                {item.url && (
                  <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[#141a29] border border-[#232d42] text-[11px]">
                    <span className="text-neutral-400 truncate font-mono">{item.url}</span>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-rose-400 hover:text-rose-300 font-semibold shrink-0"
                    >
                      Open
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
