"use client";

import React, { useCallback, useEffect, useState } from "react";
import { HardDrive, Loader2, Search, Trash2 } from "lucide-react";

type QueueStats = { pending: number; failing: number; lastError: string | null };
type ScanFolder = {
  folderType: string;
  prefix: string;
  scanned: number;
  orphanCount: number;
  orphanBytes: number;
  sample: string[];
};

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Admin panel for Backblaze cleanup. Files of deleted or replaced reels, dramas
 * and episodes are removed automatically; this shows the queue, retries it, and
 * finds older files no longer used by anything. Payout receipts are never touched.
 */
export default function StorageCleanupCard() {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [busy, setBusy] = useState<"process" | "scan" | "delete" | null>(null);
  const [scan, setScan] = useState<ScanFolder[] | null>(null);
  const [message, setMessage] = useState("");

  const loadStats = useCallback(async () => {
    const res = await fetch("/api/admin/storage-cleanup");
    if (res.ok) setStats(await res.json());
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const run = async (action: "process" | "scan" | "delete-orphans") => {
    setBusy(action === "delete-orphans" ? "delete" : action);
    setMessage("");
    try {
      const res = await fetch("/api/admin/storage-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      if (action === "scan") {
        setScan(data.folders);
        const total = (data.folders as ScanFolder[]).reduce((n, f) => n + f.orphanCount, 0);
        setMessage(total ? `Found ${total} unused file(s).` : "No unused files found.");
      } else {
        if (action === "delete-orphans") setScan(null);
        setMessage(
          `Deleted ${data.deleted} file(s)` +
            (data.keptInUse ? `, kept ${data.keptInUse} still in use` : "") +
            (data.failed ? `, ${data.failed} failed (will retry)` : "") +
            (data.remaining ? ". More remain — run again." : ".")
        );
        if (data.queue) setStats(data.queue);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      void loadStats();
    }
  };

  const orphanTotal = scan?.reduce((n, f) => n + f.orphanCount, 0) ?? 0;
  const orphanBytes = scan?.reduce((n, f) => n + f.orphanBytes, 0) ?? 0;

  return (
    <section
      aria-labelledby="storage-cleanup-heading"
      className="space-y-4 rounded-2xl border border-[#1d273a] bg-[#0e131f] p-6 shadow-xl"
    >
      <div className="flex items-center gap-2 border-b border-[#1d273a] pb-2">
        <HardDrive className="h-4 w-4 text-sky-300" aria-hidden="true" />
        <h2 id="storage-cleanup-heading" className="text-sm font-bold text-white">
          Storage cleanup (Backblaze)
        </h2>
      </div>
      <p className="text-sm text-neutral-300">
        When you delete or replace a reel, drama or episode, its video, cover and thumbnail files are removed from
        Backblaze automatically. Payout receipts are always kept.
      </p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="text-neutral-300">
          Waiting to delete: <strong className="text-white">{stats ? stats.pending : "…"}</strong>
        </span>
        {stats && stats.failing > 0 && (
          <span className="text-amber-300">
            {stats.failing} retrying{stats.lastError ? ` — last error: ${stats.lastError}` : ""}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run("process")}
          disabled={busy !== null || !stats?.pending}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#232d41] px-4 text-sm font-semibold text-white hover:bg-[#2e3b52] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50"
        >
          {busy === "process" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
          Delete waiting files now
        </button>
        <button
          type="button"
          onClick={() => run("scan")}
          disabled={busy !== null}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#2b3850] px-4 text-sm font-semibold text-neutral-100 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50"
        >
          {busy === "scan" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
          Find unused files
        </button>
      </div>

      {scan && orphanTotal > 0 && (
        <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <p className="text-amber-100">
            <strong>{orphanTotal}</strong> file(s), {formatBytes(orphanBytes)}, are in Backblaze but not used by any reel,
            episode or drama (only files older than 24 hours are counted).
          </p>
          <ul className="space-y-1 text-neutral-300">
            {scan.map((f) => (
              <li key={f.folderType}>
                <span className="font-mono text-xs">{f.prefix}</span>: {f.orphanCount} of {f.scanned} files unused (
                {formatBytes(f.orphanBytes)})
              </li>
            ))}
          </ul>
          <details className="text-xs text-neutral-400">
            <summary className="cursor-pointer text-neutral-300">Show examples</summary>
            <ul className="mt-2 space-y-0.5 font-mono">
              {scan.flatMap((f) => f.sample).map((name) => (
                <li key={name} className="break-all">
                  {name}
                </li>
              ))}
            </ul>
          </details>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Permanently delete ${orphanTotal} unused file(s) from Backblaze?`)) void run("delete-orphans");
            }}
            disabled={busy !== null}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-50"
          >
            {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
            Delete {orphanTotal} unused file(s)
          </button>
        </div>
      )}

      <p role="status" aria-live="polite" className="text-sm text-neutral-200">
        {message}
      </p>
    </section>
  );
}
