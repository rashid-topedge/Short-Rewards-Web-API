"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Search,
  Coins,
  Flame,
  Edit2,
  Trash2,
  History,
  X,
  Plus,
  RefreshCw,
  Calendar,
  ShieldCheck,
} from "lucide-react";
import type { UserProfile, CoinTransaction } from "@/lib/types";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Edit user modal
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [newCoins, setNewCoins] = useState<number>(0);
  const [newStreakDay, setNewStreakDay] = useState<number>(0);
  const [editReason, setEditReason] = useState<string>("Admin Adjustment");

  // History modal
  const [historyUser, setHistoryUser] = useState<UserProfile | null>(null);
  const [historyTransactions, setHistoryTransactions] = useState<CoinTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function fetchUsers(searchQuery: string = query) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(searchQuery)}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.items || []);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  function openEditModal(user: UserProfile) {
    setEditUser(user);
    setNewCoins(user.coins);
    setNewStreakDay(user.streakDay);
    setEditReason("Admin Adjustment");
  }

  async function handleSaveUserEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;

    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: editUser.userId,
          coins: newCoins,
          streakDay: newStreakDay,
          description: editReason,
        }),
      });

      if (res.ok) {
        setEditUser(null);
        fetchUsers();
      }
    } catch (err) {
      console.error("Failed to update user", err);
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm(`Are you sure you want to delete user ${userId}? All associated coin records will be deleted.`)) return;
    try {
      const res = await fetch(`/api/admin/users?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (err) {
      console.error("Failed to delete user", err);
    }
  }

  async function openHistoryModal(user: UserProfile) {
    setHistoryUser(user);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/admin/transactions?userId=${encodeURIComponent(user.userId)}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setHistoryTransactions(data.items || []);
      }
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Users className="w-6 h-6 text-amber-400" />
            <span>User Accounts & Coin Wallets</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Total {total} user profiles. Inspect coin balances, manage streaks, and view transactions.
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              fetchUsers(e.target.value);
            }}
            placeholder="Search by User ID (e.g. user_xxx)..."
            className="w-full bg-[#0F1420] border border-white/10 focus:border-purple-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition"
          />
        </div>
        <button
          onClick={() => fetchUsers()}
          className="p-2.5 bg-[#0F1420] border border-white/10 hover:border-white/20 text-slate-300 rounded-xl transition"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-[#0F1420] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#141A29] text-slate-400 font-semibold border-b border-white/10">
              <tr>
                <th className="py-3 px-4">User ID</th>
                <th className="py-3 px-4">Coin Balance</th>
                <th className="py-3 px-4">7-Day Streak</th>
                <th className="py-3 px-4">Last Check-in</th>
                <th className="py-3 px-4">Today's Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No users found matching query.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.userId} className="hover:bg-white/[0.02] transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-mono font-bold text-amber-300 shrink-0">
                          {user.userId.slice(-2).toUpperCase()}
                        </div>
                        <span className="font-mono font-semibold text-white">
                          {user.userId}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 font-mono font-bold border border-amber-500/20">
                        <Coins className="w-3.5 h-3.5" />
                        <span>{user.coins.toLocaleString()}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {user.streakDay > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-400 font-semibold text-xs border border-rose-500/20">
                          <Flame className="w-3.5 h-3.5" />
                          <span>Day {user.streakDay}/7</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">No Streak</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {user.lastCheckInDate || "�"}
                    </td>
                    <td className="py-3 px-4">
                      {user.canCheckInToday ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                          Claimable (+{user.nextCheckInReward})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-white/5 text-slate-400 text-[10px]">
                          Claimed ?
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1 shrink-0">
                      <button
                        onClick={() => openHistoryModal(user)}
                        className="p-1.5 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition"
                        title="Coin Transaction Ledger"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEditModal(user)}
                        className="p-1.5 hover:bg-purple-500/20 text-purple-400 rounded-lg transition"
                        title="Edit Coins / Streak"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.userId)}
                        className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit User Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0F1420] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-base font-bold text-white">Edit User Profile</h2>
                <p className="text-[11px] text-slate-400 font-mono">{editUser.userId}</p>
              </div>
              <button
                onClick={() => setEditUser(null)}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUserEdit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Coin Balance ??</label>
                <input
                  type="number"
                  min={0}
                  value={newCoins}
                  onChange={(e) => setNewCoins(Number(e.target.value))}
                  className="w-full bg-[#161D2E] border border-white/10 focus:border-purple-500 rounded-xl px-3 py-2 text-white font-mono outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">7-Day Streak Day (0 to 7) ??</label>
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={newStreakDay}
                  onChange={(e) => setNewStreakDay(Number(e.target.value))}
                  className="w-full bg-[#161D2E] border border-white/10 focus:border-purple-500 rounded-xl px-3 py-2 text-white font-mono outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Adjustment Reason</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g. VIP Bonus, Manual Correction"
                  className="w-full bg-[#161D2E] border border-white/10 focus:border-purple-500 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 text-white font-semibold rounded-xl shadow-lg shadow-purple-600/30"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Transaction History Modal */}
      {historyUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-[#0F1420] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-emerald-400" />
                  <span>Coin Ledger: {historyUser.userId}</span>
                </h2>
                <p className="text-[11px] text-slate-400">
                  Current Balance: <span className="font-mono font-bold text-amber-300">?? {historyUser.coins}</span>
                </p>
              </div>
              <button
                onClick={() => setHistoryUser(null)}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="divide-y divide-white/5">
              {historyLoading ? (
                <p className="text-xs text-slate-500 py-6 text-center">Loading transactions...</p>
              ) : historyTransactions.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No coin activity recorded for this user.</p>
              ) : (
                historyTransactions.map((tx) => (
                  <div key={tx.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-semibold text-slate-200 block">{tx.description}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(tx.createdAt).toLocaleString()} � Type: {tx.type}
                      </span>
                    </div>
                    <span
                      className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                        tx.amount >= 0 ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"
                      }`}
                    >
                      {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} ??
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
