import React from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateSessionToken } from "@/lib/auth";
import { getAdminDashboardStats } from "@/lib/db";
import {
  Tv2,
  Video,
  Users,
  Coins,
  CreditCard,
  Flame,
  ArrowUpRight,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Cloud,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("dramflix_admin_session")?.value;

  if (!validateSessionToken(token)) {
    redirect("/admin/login");
  }

  const stats = await getAdminDashboardStats();

  return (
    <div className="space-y-8">
      {/* Top Banner / Welcome */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-900/40 via-purple-900/20 to-neutral-900 border border-rose-500/20 p-8 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold tracking-wide">
              <Flame className="w-3.5 h-3.5 animate-pulse" /> Live Streaming Engine
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">
              Executive Overview
            </h1>
            <p className="text-sm text-neutral-400 max-w-xl">
              Monitor published dramas, short reels, user check-in streaks, PKR redemptions, and real-time coin economy activity.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/payouts"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/30 transition-all hover:scale-[1.02]"
            >
              <CreditCard className="w-4 h-4" /> Payout Queue ({stats.pendingRedemptionsCount})
            </Link>
            <Link
              href="/admin/dramas"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-semibold text-sm shadow-lg shadow-rose-600/30 transition-all hover:scale-[1.02]"
            >
              <PlusCircle className="w-4 h-4" /> Manage Dramas
            </Link>
            <Link
              href="/admin/reels"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e293b] hover:bg-[#334155] border border-slate-700 text-slate-200 font-semibold text-sm transition-all hover:scale-[1.02]"
            >
              <Video className="w-4 h-4 text-purple-400" /> Manage Reels
            </Link>
            <Link
              href="/admin/settings"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e293b] hover:bg-[#334155] border border-slate-700 text-slate-200 font-semibold text-sm transition-all hover:scale-[1.02]"
            >
              <Cloud className="w-4 h-4 text-cyan-400" /> B2 Storage Keys
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Dramas */}
        <div className="rounded-2xl bg-[#0f141f] border border-[#1a2333] p-5 shadow-lg relative overflow-hidden group hover:border-rose-500/30 transition">
          <div className="flex items-center justify-between pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Drama Series
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
              <Tv2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white">
            {stats.totalDramas.toLocaleString()}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs">
            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
              <CheckCircle2 className="w-3 h-3" /> {stats.publishedDramas.toLocaleString()} Live
            </span>
            <span className="text-neutral-500 font-mono">|</span>
            <span className="text-amber-400 flex items-center gap-1 font-semibold">
              <AlertCircle className="w-3 h-3" /> {stats.draftDramas.toLocaleString()} Drafts
            </span>
          </div>
        </div>

        {/* Short Reels */}
        <div className="rounded-2xl bg-[#0f141f] border border-[#1a2333] p-5 shadow-lg relative overflow-hidden group hover:border-purple-500/30 transition">
          <div className="flex items-center justify-between pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Short Reels
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Video className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white">
            {stats.totalReels.toLocaleString()}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs">
            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
              <CheckCircle2 className="w-3 h-3" /> {stats.publishedReels.toLocaleString()} Live
            </span>
            <span className="text-neutral-500 font-mono">|</span>
            <span className="text-amber-400 flex items-center gap-1 font-semibold">
              <AlertCircle className="w-3 h-3" /> {stats.draftReels.toLocaleString()} Drafts
            </span>
          </div>
        </div>

        {/* Pending Payout Requests */}
        <div className="rounded-2xl bg-[#0f141f] border border-[#1a2333] p-5 shadow-lg relative overflow-hidden group hover:border-emerald-500/30 transition">
          <div className="flex items-center justify-between pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              PKR Redemptions
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white">
            {stats.pendingRedemptionsCount} Pending
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs">
            <span className="text-amber-400 font-semibold">
              Rs. {stats.pendingRedemptionsPkr.toLocaleString()} PKR
            </span>
            <span className="text-neutral-500 font-mono">|</span>
            <span className="text-emerald-400 font-semibold">
              Paid: Rs. {stats.totalPaidPkr.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Coin Circulation */}
        <div className="rounded-2xl bg-[#0f141f] border border-[#1a2333] p-5 shadow-lg relative overflow-hidden group hover:border-amber-500/30 transition">
          <div className="flex items-center justify-between pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Coin Circulation
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white flex items-center gap-2">
            <span className="text-amber-400">🪙</span> {stats.totalCoinsInCirculation.toLocaleString()}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-neutral-400">
            <span className="text-amber-300 font-semibold flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> {stats.totalTransactions.toLocaleString()} Ledger Events
            </span>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Recent Users & Live Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Users */}
        <div className="rounded-2xl bg-[#0d111a] border border-[#182030] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" /> User Activity & Balances
            </h2>
            <Link
              href="/admin/users"
              className="text-xs font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1 transition"
            >
              View All <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {stats.recentUsers.length === 0 ? (
              <p className="text-xs text-neutral-500 py-6 text-center">No active users recorded yet.</p>
            ) : (
              stats.recentUsers.map((user) => (
                <div
                  key={user.userId}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-[#131926] border border-[#1f293d] hover:border-slate-600 transition"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-white font-mono">{user.userId}</p>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                      <span className="flex items-center gap-1 text-orange-400 font-bold">
                        <Flame className="w-3 h-3" /> Day {user.streakDay}/7 Streak
                      </span>
                      <span>•</span>
                      <span>Last: {user.lastCheckInDate || "Never"}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs">
                      🪙 {user.coins}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Coin Transactions */}
        <div className="rounded-2xl bg-[#0d111a] border border-[#182030] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" /> Live Coin Transaction Feed
            </h2>
            <Link
              href="/admin/transactions"
              className="text-xs font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1 transition"
            >
              Ledger <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {stats.recentTransactions.length === 0 ? (
              <p className="text-xs text-neutral-500 py-6 text-center">No transactions recorded yet.</p>
            ) : (
              stats.recentTransactions.slice(0, 7).map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#131926] border border-[#1f293d] text-xs"
                >
                  <div className="space-y-0.5">
                    <p className="font-semibold text-neutral-200">{tx.description}</p>
                    <p className="text-[10px] text-neutral-500 font-mono flex items-center gap-2">
                      <span>{tx.userId}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /> {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </p>
                  </div>
                  <span
                    className={`font-black text-xs px-2 py-0.5 rounded-md ${
                      tx.amount >= 0
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}
                  >
                    {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
