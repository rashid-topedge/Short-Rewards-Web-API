"use client";

import React, { useState, useEffect } from "react";
import {
  Cloud,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
  Tv2,
  Video,
  CreditCard,
  Globe,
  Coins,
  ShieldCheck,
  Server,
} from "lucide-react";
import StorageCleanupCard from "@/components/admin/StorageCleanupCard";

interface SettingsData {
  coinToPkrRate: number;
  minRedeemCoins: number;
  maxAdRewardsPerDay: number;
  adRewardCooldownSeconds: number;
  maxReelRewardsPerDay: number;
  s3Endpoint: string;
  s3Bucket: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3PublicUrl: string;

  b2DramasKeyId?: string;
  b2DramasAppKey?: string;
  b2DramasBucketId?: string;
  b2DramasPublicUrl?: string;

  b2ReelsKeyId?: string;
  b2ReelsAppKey?: string;
  b2ReelsBucketId?: string;
  b2ReelsPublicUrl?: string;

  b2PayoutsKeyId?: string;
  b2PayoutsAppKey?: string;
  b2PayoutsBucketId?: string;
  b2PayoutsPublicUrl?: string;
}

interface TestResult {
  testing: boolean;
  success?: boolean;
  message?: string;
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [form, setForm] = useState<SettingsData>({
    coinToPkrRate: 0.1,
    minRedeemCoins: 500,
    maxAdRewardsPerDay: 10,
    adRewardCooldownSeconds: 30,
    maxReelRewardsPerDay: 20,
    s3Endpoint: "s3.us-west-004.backblazeb2.com",
    s3Bucket: "",
    s3AccessKey: "",
    s3SecretKey: "",
    s3PublicUrl: "",
    b2DramasKeyId: "",
    b2DramasAppKey: "",
    b2DramasBucketId: "",
    b2DramasPublicUrl: "",
    b2ReelsKeyId: "",
    b2ReelsAppKey: "",
    b2ReelsBucketId: "",
    b2ReelsPublicUrl: "",
    b2PayoutsKeyId: "",
    b2PayoutsAppKey: "",
    b2PayoutsBucketId: "",
    b2PayoutsPublicUrl: "",
  });

  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});
  const [testResults, setTestResults] = useState<{ [key: string]: TestResult }>({});

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setForm({
            coinToPkrRate: data.coinToPkrRate ?? 0.1,
            minRedeemCoins: data.minRedeemCoins ?? 500,
            maxAdRewardsPerDay: data.maxAdRewardsPerDay ?? 10,
            adRewardCooldownSeconds: data.adRewardCooldownSeconds ?? 30,
            maxReelRewardsPerDay: data.maxReelRewardsPerDay ?? 20,
            s3Endpoint: data.s3Endpoint || "s3.us-west-004.backblazeb2.com",
            s3Bucket: data.s3Bucket || "",
            s3AccessKey: data.s3AccessKey || "",
            s3SecretKey: data.s3SecretKey || "",
            s3PublicUrl: data.s3PublicUrl || "",
            b2DramasKeyId: data.b2DramasKeyId || "",
            b2DramasAppKey: data.b2DramasAppKey || "",
            b2DramasBucketId: data.b2DramasBucketId || "",
            b2DramasPublicUrl: data.b2DramasPublicUrl || "",
            b2ReelsKeyId: data.b2ReelsKeyId || "",
            b2ReelsAppKey: data.b2ReelsAppKey || "",
            b2ReelsBucketId: data.b2ReelsBucketId || "",
            b2ReelsPublicUrl: data.b2ReelsPublicUrl || "",
            b2PayoutsKeyId: data.b2PayoutsKeyId || "",
            b2PayoutsAppKey: data.b2PayoutsAppKey || "",
            b2PayoutsBucketId: data.b2PayoutsBucketId || "",
            b2PayoutsPublicUrl: data.b2PayoutsPublicUrl || "",
          });
        }
      })
      .catch((err) => console.error("Error loading settings:", err))
      .finally(() => setLoading(false));
  }, []);

  const toggleShowKey = (field: string) => {
    setShowKeys((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleTestConnection = async (folderType: "dramas" | "reels" | "payouts" | "fallback") => {
    let keyId = "";
    let applicationKey = "";
    let bucketId = "";

    if (folderType === "dramas") {
      keyId = form.b2DramasKeyId || form.s3AccessKey;
      applicationKey = form.b2DramasAppKey || form.s3SecretKey;
      bucketId = form.b2DramasBucketId || form.s3Bucket;
    } else if (folderType === "reels") {
      keyId = form.b2ReelsKeyId || form.s3AccessKey;
      applicationKey = form.b2ReelsAppKey || form.s3SecretKey;
      bucketId = form.b2ReelsBucketId || form.s3Bucket;
    } else if (folderType === "payouts") {
      keyId = form.b2PayoutsKeyId || form.s3AccessKey;
      applicationKey = form.b2PayoutsAppKey || form.s3SecretKey;
      bucketId = form.b2PayoutsBucketId || form.s3Bucket;
    } else {
      keyId = form.s3AccessKey;
      applicationKey = form.s3SecretKey;
      bucketId = form.s3Bucket;
    }

    if (!keyId || !applicationKey || !bucketId) {
      setTestResults((prev) => ({
        ...prev,
        [folderType]: {
          testing: false,
          success: false,
          message: "Please fill in Key ID, Application Key, and Bucket ID before testing.",
        },
      }));
      return;
    }

    setTestResults((prev) => ({
      ...prev,
      [folderType]: { testing: true },
    }));

    try {
      const res = await fetch("/api/admin/settings/test-b2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId, applicationKey, bucketId }),
      });

      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [folderType]: {
          testing: false,
          success: data.success,
          message: data.message,
        },
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResults((prev) => ({
        ...prev,
        [folderType]: {
          testing: false,
          success: false,
          message: `Network error: ${msg}`,
        },
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    setSaveError("");

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        throw new Error("Failed to save settings to database");
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-neutral-400 font-semibold tracking-wide">Loading Storage Settings...</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-6xl">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-rose-900/30 via-neutral-900 to-purple-900/20 border border-rose-500/20 shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold uppercase tracking-wider">
            <Cloud className="w-3.5 h-3.5" /> Backblaze B2 Multi-Bucket Cloud Storage
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Storage & Backblaze Keys Configuration
          </h1>
          <p className="text-xs text-neutral-400 max-w-2xl">
            Configure application keys and bucket targets for dramas, short reels, and payment receipts. Each bucket category supports independent credentials or falls back gracefully to global S3/B2 settings or local disk.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all hover:scale-[1.02] disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save Storage Settings"}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          Settings saved successfully! All uploads will now route to the configured Backblaze B2 buckets.
        </div>
      )}

      {saveError && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          {saveError}
        </div>
      )}

      {/* 3 Bucket Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dramas Bucket Card */}
        <div className="p-6 rounded-2xl bg-[#0e131f] border border-[#1d273a] shadow-xl space-y-5 hover:border-rose-500/40 transition">
          <div className="flex items-center justify-between pb-2 border-b border-[#1d273a]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold">
                <Tv2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Dramas Bucket</h2>
                <p className="text-[11px] text-neutral-400">Folder: <span className="font-mono text-rose-400">dramas/</span></p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleTestConnection("dramas")}
              disabled={testResults.dramas?.testing}
              className="px-2.5 py-1 rounded-lg bg-[#1a2336] hover:bg-[#25324d] text-rose-400 text-[11px] font-bold border border-slate-700 transition"
            >
              {testResults.dramas?.testing ? "Verifying..." : "Test Bucket"}
            </button>
          </div>

          {testResults.dramas?.message && (
            <div
              className={`p-2.5 rounded-lg text-[11px] font-medium border ${
                testResults.dramas.success
                  ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-950/40 border-rose-500/30 text-rose-300"
              }`}
            >
              {testResults.dramas.message}
            </div>
          )}

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Key ID (applicationKeyId)</label>
              <input
                type="text"
                value={form.b2DramasKeyId || ""}
                onChange={(e) => setForm({ ...form, b2DramasKeyId: e.target.value })}
                placeholder="e.g. 0049281a8c900000000001"
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-rose-500 font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-neutral-300">Application Key (secret)</label>
                <button
                  type="button"
                  onClick={() => toggleShowKey("b2DramasAppKey")}
                  className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1"
                >
                  {showKeys.b2DramasAppKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showKeys.b2DramasAppKey ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showKeys.b2DramasAppKey ? "text" : "password"}
                value={form.b2DramasAppKey || ""}
                onChange={(e) => setForm({ ...form, b2DramasAppKey: e.target.value })}
                placeholder="K004..."
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-rose-500 font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Bucket ID</label>
              <input
                type="text"
                value={form.b2DramasBucketId || ""}
                onChange={(e) => setForm({ ...form, b2DramasBucketId: e.target.value })}
                placeholder="e.g. 4d6a789123456789"
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-rose-500 font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Public Download / CDN URL</label>
              <input
                type="url"
                value={form.b2DramasPublicUrl || ""}
                onChange={(e) => setForm({ ...form, b2DramasPublicUrl: e.target.value })}
                placeholder="https://f004.backblazeb2.com/file/your-bucket"
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-rose-500 font-mono text-[11px]"
              />
              <p className="text-[10px] text-neutral-500">Leave blank to use default Backblaze download URL.</p>
            </div>
          </div>
        </div>

        {/* Reels Bucket Card */}
        <div className="p-6 rounded-2xl bg-[#0e131f] border border-[#1d273a] shadow-xl space-y-5 hover:border-purple-500/40 transition">
          <div className="flex items-center justify-between pb-2 border-b border-[#1d273a]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold">
                <Video className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Reels Bucket</h2>
                <p className="text-[11px] text-neutral-400">Folder: <span className="font-mono text-purple-400">reels/</span></p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleTestConnection("reels")}
              disabled={testResults.reels?.testing}
              className="px-2.5 py-1 rounded-lg bg-[#1a2336] hover:bg-[#25324d] text-purple-400 text-[11px] font-bold border border-slate-700 transition"
            >
              {testResults.reels?.testing ? "Verifying..." : "Test Bucket"}
            </button>
          </div>

          {testResults.reels?.message && (
            <div
              className={`p-2.5 rounded-lg text-[11px] font-medium border ${
                testResults.reels.success
                  ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-950/40 border-rose-500/30 text-rose-300"
              }`}
            >
              {testResults.reels.message}
            </div>
          )}

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Key ID (applicationKeyId)</label>
              <input
                type="text"
                value={form.b2ReelsKeyId || ""}
                onChange={(e) => setForm({ ...form, b2ReelsKeyId: e.target.value })}
                placeholder="e.g. 0049281a8c900000000002"
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-purple-500 font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-neutral-300">Application Key (secret)</label>
                <button
                  type="button"
                  onClick={() => toggleShowKey("b2ReelsAppKey")}
                  className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1"
                >
                  {showKeys.b2ReelsAppKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showKeys.b2ReelsAppKey ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showKeys.b2ReelsAppKey ? "text" : "password"}
                value={form.b2ReelsAppKey || ""}
                onChange={(e) => setForm({ ...form, b2ReelsAppKey: e.target.value })}
                placeholder="K004..."
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-purple-500 font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Bucket ID</label>
              <input
                type="text"
                value={form.b2ReelsBucketId || ""}
                onChange={(e) => setForm({ ...form, b2ReelsBucketId: e.target.value })}
                placeholder="e.g. 4d6a789123456788"
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-purple-500 font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Public Download / CDN URL</label>
              <input
                type="url"
                value={form.b2ReelsPublicUrl || ""}
                onChange={(e) => setForm({ ...form, b2ReelsPublicUrl: e.target.value })}
                placeholder="https://f004.backblazeb2.com/file/your-reels-bucket"
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-purple-500 font-mono text-[11px]"
              />
              <p className="text-[10px] text-neutral-500">Leave blank to use default Backblaze download URL.</p>
            </div>
          </div>
        </div>

        {/* Payouts Bucket Card */}
        <div className="p-6 rounded-2xl bg-[#0e131f] border border-[#1d273a] shadow-xl space-y-5 hover:border-emerald-500/40 transition">
          <div className="flex items-center justify-between pb-2 border-b border-[#1d273a]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Payouts Bucket</h2>
                <p className="text-[11px] text-neutral-400">Folder: <span className="font-mono text-emerald-400">payouts/</span></p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleTestConnection("payouts")}
              disabled={testResults.payouts?.testing}
              className="px-2.5 py-1 rounded-lg bg-[#1a2336] hover:bg-[#25324d] text-emerald-400 text-[11px] font-bold border border-slate-700 transition"
            >
              {testResults.payouts?.testing ? "Verifying..." : "Test Bucket"}
            </button>
          </div>

          {testResults.payouts?.message && (
            <div
              className={`p-2.5 rounded-lg text-[11px] font-medium border ${
                testResults.payouts.success
                  ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-950/40 border-rose-500/30 text-rose-300"
              }`}
            >
              {testResults.payouts.message}
            </div>
          )}

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Key ID (applicationKeyId)</label>
              <input
                type="text"
                value={form.b2PayoutsKeyId || ""}
                onChange={(e) => setForm({ ...form, b2PayoutsKeyId: e.target.value })}
                placeholder="e.g. 0049281a8c900000000003"
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-neutral-300">Application Key (secret)</label>
                <button
                  type="button"
                  onClick={() => toggleShowKey("b2PayoutsAppKey")}
                  className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1"
                >
                  {showKeys.b2PayoutsAppKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showKeys.b2PayoutsAppKey ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showKeys.b2PayoutsAppKey ? "text" : "password"}
                value={form.b2PayoutsAppKey || ""}
                onChange={(e) => setForm({ ...form, b2PayoutsAppKey: e.target.value })}
                placeholder="K004..."
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Bucket ID</label>
              <input
                type="text"
                value={form.b2PayoutsBucketId || ""}
                onChange={(e) => setForm({ ...form, b2PayoutsBucketId: e.target.value })}
                placeholder="e.g. 4d6a789123456787"
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Public Download / CDN URL</label>
              <input
                type="url"
                value={form.b2PayoutsPublicUrl || ""}
                onChange={(e) => setForm({ ...form, b2PayoutsPublicUrl: e.target.value })}
                placeholder="https://f004.backblazeb2.com/file/your-payouts-bucket"
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
              />
              <p className="text-[10px] text-neutral-500">Leave blank to use default Backblaze download URL.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Global S3 / B2 Endpoint Fallback & Economy Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Global Storage Fallback */}
        <div className="p-6 rounded-2xl bg-[#0e131f] border border-[#1d273a] shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#1d273a]">
            <Server className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white">Global Fallback / S3 Endpoint Settings</h2>
          </div>
          <p className="text-xs text-neutral-400">
            If any bucket category above is missing its specific key, these global S3/B2 credentials will be used as the default fallback.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1 md:col-span-2">
              <label className="font-semibold text-neutral-300">B2 S3 Endpoint</label>
              <input
                type="text"
                value={form.s3Endpoint || ""}
                onChange={(e) => setForm({ ...form, s3Endpoint: e.target.value })}
                placeholder="s3.us-west-004.backblazeb2.com"
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-cyan-500 font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Fallback Bucket Name / ID</label>
              <input
                type="text"
                value={form.s3Bucket || ""}
                onChange={(e) => setForm({ ...form, s3Bucket: e.target.value })}
                placeholder="my-default-bucket"
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-cyan-500 font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Default Public URL Base</label>
              <input
                type="url"
                value={form.s3PublicUrl || ""}
                onChange={(e) => setForm({ ...form, s3PublicUrl: e.target.value })}
                placeholder="https://f004.backblazeb2.com/file/my-bucket"
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-cyan-500 font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Fallback Access Key (Key ID)</label>
              <input
                type="text"
                value={form.s3AccessKey || ""}
                onChange={(e) => setForm({ ...form, s3AccessKey: e.target.value })}
                placeholder="004..."
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-cyan-500 font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Fallback Secret Key</label>
              <input
                type="password"
                value={form.s3SecretKey || ""}
                onChange={(e) => setForm({ ...form, s3SecretKey: e.target.value })}
                placeholder="K004..."
                className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-cyan-500 font-mono text-[11px]"
              />
            </div>
          </div>
        </div>

        {/* Coin & Economy Configuration */}
        <div className="p-6 rounded-2xl bg-[#0e131f] border border-[#1d273a] shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#1d273a]">
            <Coins className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">App Economy & Conversion Rates</h2>
          </div>
          <p className="text-xs text-neutral-400">
            Define exchange rate for users converting rewards coins into Pakistani Rupees (PKR) and minimum withdrawal threshold.
          </p>

          <div className="space-y-4 text-xs pt-2">
            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Coin to PKR Rate (1 Coin = X PKR)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.001"
                  value={form.coinToPkrRate}
                  onChange={(e) => setForm({ ...form, coinToPkrRate: parseFloat(e.target.value) || 0.1 })}
                  className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-amber-500 font-mono text-sm"
                />
                <span className="absolute right-3 top-2.5 text-neutral-400 text-xs font-bold">PKR</span>
              </div>
              <p className="text-[11px] text-amber-400/80 font-mono">
                1,000 coins = {(1000 * form.coinToPkrRate).toFixed(0)} PKR
              </p>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Minimum Redeemable Coins</label>
              <div className="relative">
                <input
                  type="number"
                  step="50"
                  min="100"
                  value={form.minRedeemCoins}
                  onChange={(e) => setForm({ ...form, minRedeemCoins: parseInt(e.target.value, 10) || 500 })}
                  className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-amber-500 font-mono text-sm"
                />
                <span className="absolute right-3 top-2.5 text-neutral-400 text-xs font-bold">Coins</span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Minimum payout: {(form.minRedeemCoins * form.coinToPkrRate).toFixed(0)} PKR
              </p>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Max Ad Rewards per User per Day</label>
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={form.maxAdRewardsPerDay}
                  onChange={(e) => setForm({ ...form, maxAdRewardsPerDay: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-amber-500 font-mono text-sm"
                />
                <span className="absolute right-3 top-2.5 text-neutral-400 text-xs font-bold">Ads</span>
              </div>
              <p className="text-[11px] text-neutral-400">Up to {form.maxAdRewardsPerDay * 25} coins/day from ads (25 each). 0 disables ad rewards.</p>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Cooldown Between Ad Rewards</label>
              <div className="relative">
                <input
                  type="number"
                  step="5"
                  min="0"
                  value={form.adRewardCooldownSeconds}
                  onChange={(e) => setForm({ ...form, adRewardCooldownSeconds: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-amber-500 font-mono text-sm"
                />
                <span className="absolute right-3 top-2.5 text-neutral-400 text-xs font-bold">Sec</span>
              </div>
              <p className="text-[11px] text-neutral-400">Minimum wait between two ad rewards for the same user.</p>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-neutral-300">Max Reel Rewards per User per Day</label>
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={form.maxReelRewardsPerDay}
                  onChange={(e) => setForm({ ...form, maxReelRewardsPerDay: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  className="w-full px-3 py-2 rounded-xl bg-[#141b2b] border border-[#232f46] text-white focus:outline-none focus:border-amber-500 font-mono text-sm"
                />
                <span className="absolute right-3 top-2.5 text-neutral-400 text-xs font-bold">Reels</span>
              </div>
              <p className="text-[11px] text-neutral-400">Up to {form.maxReelRewardsPerDay * 5} coins/day from reels (5 each, once per reel). 0 disables reel rewards.</p>
            </div>
          </div>
        </div>
      </div>

      <StorageCleanupCard />

      {/* Footer Save Button Bar */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1d273a]">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-sm font-bold shadow-xl shadow-rose-600/30 transition-all hover:scale-[1.02] disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving Changes..." : "Save All Settings"}
        </button>
      </div>
    </form>
  );
}
