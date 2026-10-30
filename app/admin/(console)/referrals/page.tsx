"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import { CheckCircle2, Coins, Hourglass, Loader2, Search, Trophy, UserPlus, X, XCircle } from "lucide-react";

type Status = "pending" | "rewarded" | "rejected";
type Item = {
  refereeUserId: string;
  refereeEmail: string | null;
  referrerUserId: string;
  referrerEmail: string | null;
  code: string;
  status: Status;
  createdAt: number;
  rewardedAt: number | null;
  referrerCoins: number;
  refereeCoins: number;
  note: string | null;
};
type Stats = {
  pending: number;
  rewarded: number;
  rejected: number;
  coinsPaid: number;
  topReferrers: { userId: string; email: string | null; count: number; coins: number }[];
};

const TABS: { value: "" | Status; label: string }[] = [
  { value: "", label: "All" },
  { value: "pending", label: "Waiting" },
  { value: "rewarded", label: "Paid" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_BADGE: Record<Status, string> = {
  pending: "bg-sky-400/15 text-sky-200",
  rewarded: "bg-emerald-500/15 text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-200",
};
const STATUS_LABEL: Record<Status, string> = { pending: "Waiting", rewarded: "Paid", rejected: "Rejected" };

function Who({ id, email }: { id: string; email: string | null }) {
  return (
    <span className="block min-w-0">
      {email && <span className="block truncate text-white">{email}</span>}
      <span className={`block truncate font-mono text-xs ${email ? "text-neutral-400" : "text-neutral-200"}`}>{id}</span>
    </span>
  );
}

export default function ReferralsPage() {
  const [status, setStatus] = useState<"" | Status>("");
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const searchId = useId();

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const p = new URLSearchParams({ limit: "30" });
      if (status) p.set("status", status);
      if (userId) p.set("userId", userId);
      if (cursor) p.set("cursor", cursor);
      else p.set("stats", "1");
      const res = await fetch(`/api/admin/referrals?${p}`);
      if (!res.ok) throw new Error();
      return (await res.json()) as { items: Item[]; nextCursor: string | null; stats: Stats | null };
    },
    [status, userId]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = await fetchPage(null);
      setItems(d.items);
      setNextCursor(d.nextCursor);
      if (d.stats) setStats(d.stats);
    } catch {
      setError("Couldn't load referrals. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const d = await fetchPage(nextCursor);
      setItems((prev) => [...prev, ...d.items]);
      setNextCursor(d.nextCursor);
    } catch {
      setError("Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  };

  const act = async (item: Item, action: "pay" | "reject") => {
    const note = window.prompt(
      action === "pay"
        ? "Pay this referral now? Both people get their coins, even if the rules aren't met yet. Optional note:"
        : "Reject this referral? Nobody gets paid for it. Reason (optional):",
      ""
    );
    if (note === null) return;
    const res = await fetch(`/api/admin/referrals/${encodeURIComponent(item.refereeUserId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setNotice(res.ok ? (action === "pay" ? "Referral paid." : "Referral rejected.") : data.error || "Couldn't update the referral.");
    if (res.ok) reload();
  };

  return (
    <div className="space-y-6 text-neutral-100">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-white">
          <UserPlus className="h-6 w-6 text-emerald-300" aria-hidden="true" /> Referrals
        </h1>
        <p className="mt-1 text-sm text-neutral-300">
          Who invited whom. A referral waits until the new user meets the rules on the{" "}
          <a href="/admin/rewards" className="font-semibold text-purple-300 underline underline-offset-2">
            Rewards
          </a>{" "}
          page, then both people are paid automatically.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<Hourglass className="h-4 w-4 text-sky-300" />} label="Waiting" value={stats.pending} />
          <Stat icon={<CheckCircle2 className="h-4 w-4 text-emerald-300" />} label="Paid" value={stats.rewarded} />
          <Stat icon={<XCircle className="h-4 w-4 text-rose-300" />} label="Rejected" value={stats.rejected} />
          <Stat icon={<Coins className="h-4 w-4 text-amber-300" />} label="Coins paid" value={stats.coinsPaid} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-[#1e283b] bg-[#0f141f] p-4 md:flex-row md:items-center">
            <form
              className="relative flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                setUserId(query.trim());
              }}
            >
              <label htmlFor={searchId} className="sr-only">
                Filter by user ID
              </label>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (!e.target.value) setUserId("");
                }}
                placeholder="User ID (inviter or new user), then Enter"
                className="h-11 w-full rounded-xl border border-[#2b3850] bg-[#161c28] pl-10 pr-4 text-sm text-white placeholder:text-neutral-500 focus:border-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
              />
            </form>
            <div role="group" aria-label="Filter by status" className="flex gap-1 rounded-xl border border-[#2b3850] bg-[#161c28] p-1">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={status === t.value}
                  onClick={() => setStatus(t.value)}
                  className={`h-9 flex-1 rounded-lg px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 md:flex-none ${
                    status === t.value ? "bg-purple-600 text-white" : "text-neutral-300 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div role="status" aria-live="polite" className={notice ? "" : "sr-only"}>
            {notice && (
              <div className="flex items-center justify-between rounded-xl border border-[#2b3850] bg-[#121a29] px-4 py-3 text-sm">
                {notice}
                <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message" className="rounded p-1 text-neutral-300 hover:text-white">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-300" role="status">
              <Loader2 className="h-5 w-5 animate-spin text-purple-400" aria-hidden="true" /> Loading referrals…
            </div>
          ) : error ? (
            <p role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-500/10 py-10 text-center text-sm text-rose-100">
              {error}
            </p>
          ) : items.length === 0 ? (
            <p className="rounded-2xl border border-[#1e283b] bg-[#0f141f] py-14 text-center text-sm text-neutral-400">No referrals here yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#1e283b] bg-[#0f141f]">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-[#1e283b] text-xs uppercase tracking-wide text-neutral-400">
                  <tr>
                    <th scope="col" className="px-4 py-3">New user</th>
                    <th scope="col" className="px-4 py-3">Invited by</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3">Coins paid</th>
                    <th scope="col" className="px-4 py-3">Date</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e283b]">
                  {items.map((it) => (
                    <tr key={it.refereeUserId} className="align-top">
                      <td className="max-w-[220px] px-4 py-3">
                        <Who id={it.refereeUserId} email={it.refereeEmail} />
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <Who id={it.referrerUserId} email={it.referrerEmail} />
                        <span className="mt-0.5 block font-mono text-xs text-neutral-500">code {it.code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[it.status]}`}>{STATUS_LABEL[it.status]}</span>
                        {it.note && <span className="mt-1 block max-w-[200px] text-xs text-neutral-400">{it.note}</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-300">
                        {it.status === "rewarded" ? (
                          <>
                            {it.referrerCoins} to inviter
                            <span className="block text-xs text-neutral-400">{it.refereeCoins} to new user</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-300">
                        {new Date(it.createdAt).toLocaleDateString()}
                        {it.rewardedAt && <span className="block text-xs text-neutral-500">paid {new Date(it.rewardedAt).toLocaleDateString()}</span>}
                      </td>
                      <td className="px-4 py-3">
                        {it.status === "pending" && (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => act(it, "pay")}
                              className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                            >
                              Pay now
                            </button>
                            <button
                              type="button"
                              onClick={() => act(it, "reject")}
                              className="h-9 rounded-lg border border-rose-500/50 px-3 text-xs font-bold text-rose-200 hover:bg-rose-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {nextCursor && !loading && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#2b3850] px-4 text-sm font-semibold hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Load more
              </button>
            </div>
          )}
        </div>

        <section aria-labelledby="top-referrers" className="h-fit rounded-2xl border border-[#1e283b] bg-[#0f141f] p-4">
          <h2 id="top-referrers" className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <Trophy className="h-4 w-4 text-amber-300" aria-hidden="true" /> Top inviters
          </h2>
          {!stats || stats.topReferrers.length === 0 ? (
            <p className="text-sm text-neutral-400">No paid referrals yet.</p>
          ) : (
            <ol className="space-y-1">
              {stats.topReferrers.map((t, i) => (
                <li key={t.userId}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(t.userId);
                      setUserId(t.userId);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                  >
                    <span className="w-5 text-xs font-bold text-neutral-400">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-sm">
                      <Who id={t.userId} email={t.email} />
                    </span>
                    <span className="text-right text-xs text-neutral-300">
                      <span className="block font-bold text-white">{t.count} paid</span>
                      {t.coins.toLocaleString()} coins
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#1e283b] bg-[#0f141f] p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-white">{value.toLocaleString()}</p>
    </div>
  );
}
