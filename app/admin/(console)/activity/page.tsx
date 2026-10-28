"use client";

import React, { useCallback, useEffect, useState } from "react";
import { History, Loader2, ShieldCheck, UserRound } from "lucide-react";
import type { ActivityEntry } from "@/lib/types";

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Everything" },
  { value: "reel", label: "Reels" },
  { value: "staff", label: "Team & sign-ins" },
];

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [entityType, setEntityType] = useState("");

  const load = useCallback(
    async (cursor: string | null) => {
      const params = new URLSearchParams({ limit: "50" });
      if (cursor) params.set("cursor", cursor);
      if (entityType) params.set("entityType", entityType);
      const res = await fetch(`/api/admin/activity?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { items: ActivityEntry[]; nextCursor: string | null };
    },
    [entityType]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    load(null)
      .then((d) => {
        if (cancelled) return;
        setItems(d.items);
        setNextCursor(d.nextCursor);
      })
      .catch(() => !cancelled && setError("Couldn't load the activity log."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [load]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const d = await load(nextCursor);
      setItems((prev) => [...prev, ...d.items]);
      setNextCursor(d.nextCursor);
    } catch {
      setError("Couldn't load more entries.");
    } finally {
      setLoadingMore(false);
    }
  };

  const groups: { day: string; entries: ActivityEntry[] }[] = [];
  for (const e of items) {
    const day = dayLabel(e.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(e);
    else groups.push({ day, entries: [e] });
  }

  return (
    <div className="space-y-6 text-neutral-100">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-white">
            <History className="h-6 w-6 text-purple-300" aria-hidden="true" /> Activity log
          </h1>
          <p className="mt-1 text-sm text-neutral-300">Who uploaded, edited, approved or removed what, newest first.</p>
        </div>
        <div role="group" aria-label="Filter activity" className="flex gap-1 self-start rounded-xl border border-[#2b3850] bg-[#161c28] p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={entityType === f.value}
              onClick={() => setEntityType(f.value)}
              className={`h-9 rounded-lg px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                entityType === f.value ? "bg-purple-600 text-white" : "text-neutral-300 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-300" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-purple-400" aria-hidden="true" /> Loading activity…
        </div>
      ) : error && items.length === 0 ? (
        <p role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-500/10 py-10 text-center text-sm text-rose-100">
          {error}
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-[#1e283b] bg-[#0f141f] py-14 text-center text-sm text-neutral-400">No activity yet.</p>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.day} aria-label={g.day}>
              <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-neutral-400">{g.day}</h2>
              <ol className="divide-y divide-[#1e283b] overflow-hidden rounded-2xl border border-[#1e283b] bg-[#0f141f]">
                {g.entries.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        e.actorRole === "admin" ? "bg-emerald-500/15 text-emerald-300" : "bg-sky-500/15 text-sky-300"
                      }`}
                      aria-hidden="true"
                    >
                      {e.actorRole === "admin" ? <ShieldCheck className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-neutral-100">
                        <strong className="font-semibold text-white">{e.actorName}</strong>{" "}
                        <span className="text-xs text-neutral-400">({e.actorRole === "admin" ? "admin" : "moderator"})</span>
                      </p>
                      <p className="break-words text-sm text-neutral-300">{e.summary}</p>
                    </div>
                    <time dateTime={new Date(e.createdAt).toISOString()} className="shrink-0 text-xs text-neutral-400">
                      {new Date(e.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </time>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {error && <p role="alert" className="text-center text-sm text-rose-200">{error}</p>}
          {nextCursor && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#2b3850] px-4 text-sm font-semibold text-neutral-100 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Load more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
