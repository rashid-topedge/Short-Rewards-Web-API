"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  CreditCard,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Upload,
  Settings,
  X,
  Loader2,
  Coins,
  DollarSign,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import type { RedemptionRequest, SystemSettings } from "@/lib/types";

export default function AdminPayoutsPage() {
  const [redemptions, setRedemptions] = useState<RedemptionRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "paid" | "rejected">("all");
  const [searchUser, setSearchUser] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    coinToPkrRate: 0.10,
    minRedeemCoins: 500,
    s3Endpoint: "",
    s3Bucket: "",
    s3AccessKey: "",
    s3SecretKey: "",
    s3PublicUrl: "",
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const [selectedRedemption, setSelectedRedemption] = useState<RedemptionRequest | null>(null);
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [transactionRef, setTransactionRef] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [processingAction, setProcessingAction] = useState(false);
  const [processError, setProcessError] = useState("");

  const [viewReceiptModal, setViewReceiptModal] = useState<RedemptionRequest | null>(null);

  const fetchRedemptions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        userId: searchUser,
        limit: String(limit),
        offset: String(offset),
      });
      const res = await fetch(`/api/admin/redemptions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRedemptions(data.items || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to load redemptions", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchUser, offset]);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setSettingsForm({
          coinToPkrRate: data.coinToPkrRate || 0.10,
          minRedeemCoins: data.minRedeemCoins || 500,
          s3Endpoint: data.s3Endpoint || "",
          s3Bucket: data.s3Bucket || "",
          s3AccessKey: data.s3AccessKey || "",
          s3SecretKey: data.s3SecretKey || "",
          s3PublicUrl: data.s3PublicUrl || "",
        });
      }
    } catch (err) {
      console.error("Failed to load settings", err);
    }
  };

  useEffect(() => {
    fetchRedemptions();
    fetchSettings();
  }, [fetchRedemptions]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setIsSettingsModalOpen(false);
      }
    } catch (err) {
      console.error("Failed to update settings", err);
    } finally {
      setSavingSettings(false);
    }
  };

  const openProcessModal = (r: RedemptionRequest) => {
    setSelectedRedemption(r);
    setTransactionRef("");
    setReceiptUrl("");
    setAdminNotes("");
    setProcessError("");
    setIsProcessModalOpen(true);
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingReceipt(true);
    setProcessError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/upload-receipt", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; url?: string; error?: string; message?: string };
        if (data.success && data.url) {
          setReceiptUrl(data.url);
        } else {
          setProcessError(data.error || data.message || "Failed to upload receipt");
        }
      } else {
        const errData = await res.json();
        setProcessError(errData.error || "Failed to upload receipt");
      }
    } catch {
      setProcessError("Network error uploading receipt");
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleReceiptUrlSubmit = async () => {
    if (!receiptUrl.trim()) return;
    setUploadingReceipt(true);
    setProcessError("");
    try {
      const res = await fetch("/api/admin/upload-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: receiptUrl.trim() }),
      });
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; url?: string; error?: string; message?: string };
        if (data.success && data.url) {
          setReceiptUrl(data.url);
        } else {
          setProcessError(data.error || data.message || "Failed to register receipt URL");
        }
      } else {
        const errData = await res.json();
        setProcessError(errData.error || "Failed to register receipt URL");
      }
    } catch {
      setProcessError("Network error registering receipt URL");
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleProcessAction = async (action: "PAID" | "REJECTED") => {
    if (!selectedRedemption) return;
    setProcessError("");
    if (action === "PAID") {
      if (!transactionRef.trim()) {
        setProcessError("Transaction ID / Reference is mandatory when marking as PAID.");
        return;
      }
      if (!receiptUrl.trim()) {
        setProcessError("Payment receipt screenshot is mandatory when marking as PAID.");
        return;
      }
    }
    if (action === "REJECTED" && !adminNotes.trim()) {
      if (!confirm("Reject this request and refund coins to user without an explanation note?")) return;
    }
    setProcessingAction(true);
    try {
      const res = await fetch(`/api/admin/redemptions/${selectedRedemption.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, transactionRef, receiptUrl, adminNotes }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsProcessModalOpen(false);
        fetchRedemptions();
      } else {
        setProcessError(data.message || "Failed to process request");
      }
    } catch {
      setProcessError("Network error processing payout");
    } finally {
      setProcessingAction(false);
    }
  };

  const pendingCount = redemptions.filter((r) => r.status === "PENDING").length;
  const pendingPkrTotal = redemptions
    .filter((r) => r.status === "PENDING")
    .reduce((sum, r) => sum + r.pkrAmount, 0);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
            <CreditCard className="w-6 h-6 text-emerald-400" /> Payouts & Coin Redemptions
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Review user coin-to-PKR redemption requests, disburse funds, and record verified payout receipts.
          </p>
        </div>
        <button
          onClick={() => setIsSettingsModalOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1e293b] hover:bg-[#334155] border border-slate-700 text-slate-200 text-xs font-semibold transition"
        >
          <Settings className="w-4 h-4 text-neutral-400" /> Conversion Settings
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[#0f141f] border border-[#1a2333] space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            Pending Queue
          </span>
          <div className="text-2xl font-extrabold text-amber-400 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" /> {pendingCount} Requests
          </div>
          <p className="text-[11px] text-neutral-500 font-mono">
            {pendingPkrTotal.toLocaleString()} PKR in review
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#0f141f] border border-[#1a2333] space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            Exchange Rate
          </span>
          <div className="text-2xl font-extrabold text-white flex items-center gap-1.5">
            <Coins className="w-5 h-5 text-amber-400" /> 1 Coin = {settings?.coinToPkrRate ?? 0.10} PKR
          </div>
          <p className="text-[11px] text-neutral-500 font-mono">
            1,000 Coins = {((settings?.coinToPkrRate ?? 0.10) * 1000).toFixed(0)} PKR
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#0f141f] border border-[#1a2333] space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            Minimum Threshold
          </span>
          <div className="text-2xl font-extrabold text-white flex items-center gap-1.5">
            <ShieldCheck className="w-5 h-5 text-cyan-400" /> {settings?.minRedeemCoins ?? 500} Coins
          </div>
          <p className="text-[11px] text-neutral-500 font-mono">
            Min payout: {((settings?.minRedeemCoins ?? 500) * (settings?.coinToPkrRate ?? 0.10)).toFixed(0)} PKR
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#0f141f] border border-[#1a2333] space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            Payout Channels
          </span>
          <div className="text-sm font-bold text-white pt-1 flex flex-wrap gap-1.5">
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
              Easypaisa
            </span>
            <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px]">
              JazzCash
            </span>
            <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px]">
              Raast / Bank
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-[#0f141f] border border-[#1a2333]">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by User ID..."
            value={searchUser}
            onChange={(e) => {
              setSearchUser(e.target.value);
              setOffset(0);
            }}
            className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
        <div className="flex items-center gap-1.5 bg-[#161c28] p-1 rounded-xl border border-[#222c3f]">
          {(["all", "pending", "paid", "rejected"] as const).map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setOffset(0);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                statusFilter === st
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-[#0f141f] border border-[#1a2333] overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-xs text-neutral-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-500" /> Loading payout requests...
          </div>
        ) : redemptions.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <CreditCard className="w-8 h-8 text-neutral-600 mx-auto" />
            <p className="text-xs font-semibold text-neutral-400">No payout requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#161c28] text-neutral-400 font-semibold border-b border-[#222c3f]">
                <tr>
                  <th className="py-3 px-4">REQ #</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Coins</th>
                  <th className="py-3 px-4">Amount (PKR)</th>
                  <th className="py-3 px-4">Method & Account</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Requested Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a2333]">
                {redemptions.map((r) => (
                  <tr key={r.id} className="hover:bg-[#131926] transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-white">#{r.id}</td>
                    <td className="py-3.5 px-4 font-mono text-neutral-300">{r.userId}</td>
                    <td className="py-3.5 px-4 font-bold text-amber-400">🪙 {r.coinsAmount}</td>
                    <td className="py-3.5 px-4">
                      <span className="font-extrabold text-emerald-400 text-sm">
                        Rs. {r.pkrAmount.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.paymentMethod.toLowerCase().includes("easy")
                              ? "bg-emerald-500/20 text-emerald-300"
                              : r.paymentMethod.toLowerCase().includes("jazz")
                              ? "bg-rose-500/20 text-rose-300"
                              : "bg-cyan-500/20 text-cyan-300"
                          }`}
                        >
                          {r.paymentMethod}
                        </span>
                        <span className="font-semibold text-white">{r.accountTitle}</span>
                      </div>
                      <p className="font-mono text-neutral-400 text-[11px]">
                        {r.accountNumber} {r.bankName ? `(${r.bankName})` : ""}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      {r.status === "PENDING" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold">
                          <Clock className="w-3 h-3" /> PENDING
                        </span>
                      )}
                      {r.status === "PAID" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3" /> PAID
                        </span>
                      )}
                      {r.status === "REJECTED" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold">
                          <XCircle className="w-3 h-3" /> REJECTED
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-neutral-400 font-mono text-[11px]">
                      {new Date(r.createdAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {r.status === "PENDING" ? (
                        <button
                          onClick={() => openProcessModal(r)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition"
                        >
                          Process Payout
                        </button>
                      ) : r.status === "PAID" ? (
                        <button
                          onClick={() => setViewReceiptModal(r)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#161c28] hover:bg-[#222c3f] text-neutral-300 hover:text-white font-medium text-xs border border-[#222c3f] transition inline-flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-400" /> View Receipt
                        </button>
                      ) : (
                        <span className="text-[11px] text-neutral-500 italic">
                          {r.adminNotes || "Refunded"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > limit && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={() => setOffset((p) => Math.max(0, p - limit))}
            disabled={offset === 0}
            className="px-4 py-2 rounded-xl bg-[#161c28] border border-[#222c3f] text-xs font-semibold text-white disabled:opacity-40 hover:bg-[#222c3f] transition"
          >
            Previous
          </button>
          <span className="text-xs text-neutral-400 font-mono">
            Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit)}
          </span>
          <button
            onClick={() => setOffset((p) => p + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 rounded-xl bg-[#161c28] border border-[#222c3f] text-xs font-semibold text-white disabled:opacity-40 hover:bg-[#222c3f] transition"
          >
            Next
          </button>
        </div>
      )}

      {isProcessModalOpen && selectedRedemption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#0f141f] border border-[#222c3f] shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#1a2333] pb-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-400" /> Process Payout #{selectedRedemption.id}
                </h2>
                <p className="text-xs text-neutral-400">User: {selectedRedemption.userId}</p>
              </div>
              <button onClick={() => setIsProcessModalOpen(false)} className="text-neutral-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#161c28] border border-[#222c3f] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-400 uppercase">Payout Amount</span>
                <span className="text-lg font-black text-emerald-400">
                  Rs. {selectedRedemption.pkrAmount.toLocaleString()} PKR
                </span>
              </div>
              <div className="border-t border-[#222c3f] pt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-neutral-500 block text-[10px]">Payment Method</span>
                  <span className="font-semibold text-white">{selectedRedemption.paymentMethod}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">Account Title</span>
                  <span className="font-semibold text-white">{selectedRedemption.accountTitle}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-neutral-500 block text-[10px]">Account Number / IBAN</span>
                  <span className="font-mono font-bold text-amber-300 text-sm">{selectedRedemption.accountNumber}</span>
                  {selectedRedemption.bankName && (
                    <span className="text-neutral-400 block text-[10px] mt-0.5">Bank: {selectedRedemption.bankName}</span>
                  )}
                </div>
              </div>
            </div>

            {processError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{processError}</span>
              </div>
            )}

            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white flex items-center justify-between">
                  <span>Transaction ID / Ref # (Mandatory for PAID)</span>
                  <span className="text-[10px] text-emerald-400 font-mono">e.g. JazzCash/Easypaisa TID</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. TID-98218731987"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-white flex items-center justify-between">
                  <span>Payment Receipt Screenshot (Mandatory for PAID)</span>
                  <span className="text-[10px] text-neutral-400">Cloudflare R2 / S3 or Image</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://... or upload below"
                    value={receiptUrl}
                    onChange={(e) => setReceiptUrl(e.target.value)}
                    onBlur={handleReceiptUrlSubmit}
                    className="flex-1 bg-[#161c28] border border-[#222c3f] rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <label className="px-3 py-2 rounded-xl bg-[#222c3f] hover:bg-[#2d3a54] text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload</span>
                    <input type="file" accept="image/*" onChange={handleReceiptUpload} className="hidden" />
                  </label>
                </div>
                {uploadingReceipt && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1 pt-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Uploading receipt image or registering URL...
                  </p>
                )}
                {receiptUrl && (
                  <div className="relative aspect-video max-h-36 rounded-lg overflow-hidden border border-[#222c3f] mt-2 bg-black">
                    <Image src={receiptUrl} alt="Receipt preview" fill unoptimized className="object-contain" />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-300">
                  Admin Notes / Remarks (Optional or Reason for Rejection)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sent via JazzCash App at 14:30"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[#1a2333]">
              <button
                type="button"
                disabled={processingAction}
                onClick={() => handleProcessAction("REJECTED")}
                className="px-4 py-2.5 rounded-xl bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/20 text-xs font-bold transition disabled:opacity-50"
              >
                Reject & Refund Coins
              </button>
              <button
                type="button"
                disabled={processingAction || uploadingReceipt}
                onClick={() => handleProcessAction("PAID")}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {processingAction ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Payout (Mark PAID)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewReceiptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0f141f] border border-[#222c3f] shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#1a2333] pb-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Payout Receipt #{viewReceiptModal.id}
                </h2>
                <p className="text-xs text-neutral-400">Rs. {viewReceiptModal.pkrAmount} PKR to {viewReceiptModal.accountTitle}</p>
              </div>
              <button onClick={() => setViewReceiptModal(null)} className="text-neutral-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-neutral-400">
              Transaction ID: <span className="font-mono text-white">{viewReceiptModal.transactionRef || "N/A"}</span>
            </p>
            {viewReceiptModal.receiptUrl ? (
              <div className="relative aspect-[3/4] max-h-96 rounded-xl overflow-hidden border border-[#222c3f] bg-black">
                <Image src={viewReceiptModal.receiptUrl} alt="Receipt screenshot" fill unoptimized className="object-contain" />
              </div>
            ) : (
              <p className="text-xs text-neutral-500 italic text-center py-6">No receipt image attached</p>
            )}
          </div>
        </div>
      )}

      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#0f141f] border border-[#222c3f] shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#1a2333] pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-neutral-400" /> Coin-to-PKR Conversion & Cloudflare R2 / S3 Settings
              </h2>
              <button onClick={() => setIsSettingsModalOpen(false)} className="text-neutral-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-300">Coin to PKR Rate</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={settingsForm.coinToPkrRate}
                    onChange={(e) => setSettingsForm({ ...settingsForm, coinToPkrRate: parseFloat(e.target.value) })}
                    className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3 py-2 text-xs text-white"
                  />
                  <span className="text-[10px] text-neutral-500">e.g. 0.10 means 1,000 coins = 100 PKR</span>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-300">Min Redeem Coins</label>
                  <input
                    type="number"
                    min="10"
                    required
                    value={settingsForm.minRedeemCoins}
                    onChange={(e) => setSettingsForm({ ...settingsForm, minRedeemCoins: parseInt(e.target.value, 10) })}
                    className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3 py-2 text-xs text-white"
                  />
                  <span className="text-[10px] text-neutral-500">e.g. 500 coins minimum</span>
                </div>
              </div>
              <div className="border-t border-[#1a2333] pt-3 space-y-3">
                <span className="text-xs font-bold text-white uppercase tracking-wider block">
                  Cloudflare R2 / S3 Storage (Optional)
                </span>
                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-400">S3 / R2 Endpoint URL</label>
                  <input
                    type="text"
                    placeholder="https://<account_id>.r2.cloudflarestorage.com"
                    value={settingsForm.s3Endpoint}
                    onChange={(e) => setSettingsForm({ ...settingsForm, s3Endpoint: e.target.value })}
                    className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">Bucket Name</label>
                    <input
                      type="text"
                      placeholder="dramflix-receipts"
                      value={settingsForm.s3Bucket}
                      onChange={(e) => setSettingsForm({ ...settingsForm, s3Bucket: e.target.value })}
                      className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">Public CDN URL Prefix</label>
                    <input
                      type="text"
                      placeholder="https://cdn.dramflix.com"
                      value={settingsForm.s3PublicUrl}
                      onChange={(e) => setSettingsForm({ ...settingsForm, s3PublicUrl: e.target.value })}
                      className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">Access Key ID</label>
                    <input
                      type="text"
                      value={settingsForm.s3AccessKey}
                      onChange={(e) => setSettingsForm({ ...settingsForm, s3AccessKey: e.target.value })}
                      className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">Secret Access Key</label>
                    <input
                      type="password"
                      value={settingsForm.s3SecretKey}
                      onChange={(e) => setSettingsForm({ ...settingsForm, s3SecretKey: e.target.value })}
                      className="w-full bg-[#161c28] border border-[#222c3f] rounded-xl px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1a2333]">
                <button type="button" onClick={() => setIsSettingsModalOpen(false)} className="px-4 py-2 rounded-xl bg-[#161c28] text-xs font-semibold text-neutral-300 hover:text-white">
                  Cancel
                </button>
                <button type="submit" disabled={savingSettings} className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 disabled:opacity-50">
                  {savingSettings ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
