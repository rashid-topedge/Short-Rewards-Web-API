"use client";

import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle, XCircle } from "lucide-react";

type Step = { step: string; ok: boolean; detail: string; warning?: boolean };

/**
 * "Full check" for one bucket, using the SAVED settings: uploads a tiny image,
 * makes the link the app would get, downloads it, checks privacy and direct
 * uploads, then deletes the test file. Shows every step.
 */
export default function StorageCheck({ folderType }: { folderType: "dramas" | "reels" | "payouts" }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; steps: Step[] } | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/storage-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#1a2336] px-2.5 py-1 text-[11px] font-bold text-sky-300 transition hover:bg-[#25324d] disabled:opacity-60"
      >
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />}
        {running ? "Checking…" : "Full check (saved settings)"}
      </button>
      <p className="text-[10px] text-neutral-500">Uploads a tiny test image, opens it the way the app does, then deletes it. Save first.</p>
      {error && <p className="text-[11px] text-rose-300" role="alert">{error}</p>}
      {result && (
        <div
          role="status"
          className={`space-y-1.5 rounded-lg border p-2.5 text-[11px] ${
            result.ok ? "border-emerald-500/30 bg-emerald-950/30" : "border-rose-500/30 bg-rose-950/30"
          }`}
        >
          <p className={`font-bold ${result.ok ? "text-emerald-300" : "text-rose-300"}`}>
            {result.ok ? "Everything works." : "Something needs fixing:"}
          </p>
          <ul className="space-y-1">
            {result.steps.map((s) => (
              <li key={s.step} className="flex items-start gap-1.5">
                {s.ok ? (
                  <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-400" aria-label="OK" />
                ) : s.warning ? (
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-400" aria-label="Warning" />
                ) : (
                  <XCircle className="mt-px h-3.5 w-3.5 shrink-0 text-rose-400" aria-label="Failed" />
                )}
                <span className="text-neutral-200">
                  <strong>{s.step}:</strong> {s.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
