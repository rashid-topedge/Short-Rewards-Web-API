"use client";

import React, { useState, useEffect } from "react";
import {
  Coins,
  Search,
  RefreshCw,
  TrendingUp,
  Flame,
  Tv,
  Gift,
  ShieldCheck,
  Calendar,
} from "lucide-react";
import type { CoinTransaction } from "@/lib/types";

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [userFilter, setUserFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Pages with a cursor: the first call replaces the list, "Load more" appends.
  async function fetchTransactions(userId: string = userFilter, cursor: string | null = null) {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (userId) params.set("userId", userId);
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/admin/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions((prev) => (cursor ? [...prev, ...(data.items || [])] : data.items || []));
        setTotal(data.total || 0);
        setNextCursor(data.nextCursor ?? null);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  const loadMore = () => {
    if (nextCursor) void fetchTransactions(userFilter, nextCursor);
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  function getTypeBadge(type: CoinTransaction["type"]) {
    switch (type) {
      case "DAILY_CHECKIN":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 font-semibold border border-rose-500/20 text-[10px]">
            <Flame className="w-3 h-3" />
            <span>DAILY CHECK-IN</span>
          </span>
        );
      case "EPISODE_WATCHED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 font-semibold border border-purple-500/20 text-[10px]">
            <Tv className="w-3 h-3" />
            <span>EPISODE WATCHED</span>
          </span>
        );
      case "REWARD_AD":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-pink-500/10 text-pink-400 font-semibold border border-pink-500/20 text-[10px]">
            <Gift className="w-3 h-3" />
            <span>REWARD AD</span>
          </span>
        );
      case "SIGNUP_BONUS":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 font-semibold border border-amber-500/20 text-[10px]">
            <Coins className="w-3 h-3" />
            <span>SIGNUP BONUS</span>
          </span>
        );
      case "ADMIN_ADJUSTMENT":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20 text-[10px]">
            <ShieldCheck className="w-3 h-3" />
            <span>ADMIN ADJUSTMENT</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/10 text-[10px]">
            <span>{type}</span>
          </span>
        );
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Coins className="w-6 h-6 text-emerald-400" />
            <span>Platform Coin Transactions Ledger</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Total {total} reward and streak transactions logged in database.
          </p>
        </div>
      </div>

      {/* Filter by User */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value);
              fetchTransactions(e.target.value);
            }}
            placeholder="Filter by User ID (e.g. user_xxx)..."
            className="w-full bg-[#0F1420] border border-white/10 focus:border-purple-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition"
          />
        </div>
        <button
          onClick={() => fetchTransactions()}
          className="p-2.5 bg-[#0F1420] border border-white/10 hover:border-white/20 text-slate-300 rounded-xl transition"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Transactions Table */}
      <div className="bg-[#0F1420] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#141A29] text-slate-400 font-semibold border-b border-white/10">
              <tr>
                <th className="py-3 px-4">TX ID</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Coins</th>
                <th className="py-3 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Loading transactions...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No transactions recorded.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/[0.02] transition">
                    <td className="py-3 px-4 font-mono text-slate-500">
                      #{tx.id}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-200">
                      {tx.userId}
                    </td>
                    <td className="py-3 px-4">
                      {getTypeBadge(tx.type)}
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-medium">
                      {tx.description}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-mono font-bold px-2 py-0.5 rounded-md text-xs inline-block ${
                          tx.amount >= 0
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}
                      >
                        {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} ??
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[11px] text-slate-400">
                      {new Date(tx.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {nextCursor && (
        <div className="flex flex-col items-center gap-2 pt-4">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="px-5 py-2.5 rounded-xl bg-[#161c28] border border-[#222c3f] text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#222c3f] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 transition"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
          <p className="text-xs text-neutral-400" aria-live="polite">
            Showing {transactions.length.toLocaleString()} of {total.toLocaleString()} transactions
          </p>
        </div>
      )}
    </div>
  );
}
