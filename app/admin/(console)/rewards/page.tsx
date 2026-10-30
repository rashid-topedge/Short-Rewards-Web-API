"use client";

import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { AlertCircle, CalendarCheck, CheckCircle2, Clapperboard, Gift, Loader2, Plus, RotateCcw, Save, Trash2, Tv2, UserPlus, Video, X } from "lucide-react";
import { parseRewardConfig, reelCoinsForDuration, type RewardConfig, type WatchTokenMode } from "@/lib/rewardConfig";

const inputClass =
  "h-10 w-full rounded-lg border border-[#2b3850] bg-[#161c28] px-3 text-sm text-white placeholder:text-neutral-500 focus:border-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60";

export default function RewardsPage() {
  const [saved, setSaved] = useState<RewardConfig | null>(null);
  const [form, setForm] = useState<RewardConfig | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/admin/rewards");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { config: RewardConfig };
      setSaved(data.config);
      setForm(structuredClone(data.config));
    } catch {
      setLoadError("Couldn't load the reward settings. Refresh to try again.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const update = (fn: (c: RewardConfig) => void) =>
    setForm((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  const save = async () => {
    if (!form) return;
    setNotice("");
    const check = parseRewardConfig(form);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/rewards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: form }),
      });
      const data = (await res.json().catch(() => ({}))) as { config?: RewardConfig; errors?: string[]; error?: string; changed?: boolean };
      if (!res.ok || !data.config) {
        setErrors(data.errors ?? [data.error ?? "Couldn't save. Please try again."]);
        return;
      }
      setSaved(data.config);
      setForm(structuredClone(data.config));
      setNotice(data.changed ? "Saved. The app sees the new amounts within a minute." : "Nothing changed.");
    } catch {
      setErrors(["Couldn't reach the server. Check your connection and try again."]);
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
        {loadError}
      </p>
    );
  }
  if (!form) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-neutral-300" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-purple-400" aria-hidden="true" /> Loading rewards…
      </div>
    );
  }

  const reelDailyMax = form.reel.maxPerDay * Math.max(form.reel.longerThanLastTier, ...form.reel.tiers.map((t) => t.coins), form.reel.unknownLength);

  return (
    <div className="space-y-6 pb-24 text-neutral-100">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-white">
          <Gift className="h-6 w-6 text-amber-300" aria-hidden="true" /> Rewards
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-300">
          Coins users earn for each action. Changes apply to new claims within a minute, with no app update or redeploy;
          past rewards keep the amount they were paid. Every change is recorded in the Activity log.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card icon={<UserPlus className="h-4 w-4 text-emerald-300" />} title="New accounts">
          <Num label="Welcome coins" suffix="coins" value={form.signupBonus} onChange={(v) => update((c) => void (c.signupBonus = v))} hint="Added when an account is created." />
        </Card>

        <Card icon={<Tv2 className="h-4 w-4 text-sky-300" />} title="Drama episodes">
          <Num label="Coins per finished episode" suffix="coins" value={form.episode.coins} onChange={(v) => update((c) => void (c.episode.coins = v))} hint="Once per episode per user." />
        </Card>

        <Card icon={<CalendarCheck className="h-4 w-4 text-amber-300" />} title="Daily check-in streak" description="Coins for each day in a row. After the last day the streak starts again at day 1; a missed day resets it.">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {form.checkIn.streak.map((coins, i) => (
              <li key={i} className="flex items-end gap-1">
                <div className="flex-1">
                  <Num label={`Day ${i + 1}`} value={coins} onChange={(v) => update((c) => void (c.checkIn.streak[i] = v))} compact />
                </div>
                {form.checkIn.streak.length > 1 && i === form.checkIn.streak.length - 1 && (
                  <IconBtn label={`Remove day ${i + 1}`} onClick={() => update((c) => void c.checkIn.streak.pop())}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </IconBtn>
                )}
              </li>
            ))}
          </ol>
          {form.checkIn.streak.length < 31 && (
            <AddBtn onClick={() => update((c) => void c.checkIn.streak.push(c.checkIn.streak[c.checkIn.streak.length - 1] ?? 10))}>Add a day</AddBtn>
          )}
        </Card>

        <Card icon={<Clapperboard className="h-4 w-4 text-pink-300" />} title="Rewarded ads">
          <div className="grid gap-3 sm:grid-cols-3">
            <Num label="Coins per ad" suffix="coins" value={form.ad.coins} onChange={(v) => update((c) => void (c.ad.coins = v))} />
            <Num label="Ads per day" value={form.ad.maxPerDay} onChange={(v) => update((c) => void (c.ad.maxPerDay = v))} hint="0 turns ad rewards off." />
            <Num label="Wait between ads" suffix="sec" value={form.ad.cooldownSeconds} onChange={(v) => update((c) => void (c.ad.cooldownSeconds = v))} />
          </div>
          <Summary>Up to {(form.ad.coins * form.ad.maxPerDay).toLocaleString()} coins per user per day from ads.</Summary>
        </Card>
      </div>

      <Card
        icon={<Video className="h-4 w-4 text-purple-300" />}
        title="Short reels: coins by length"
        description="A reel pays the first row its length fits in, once per user. The length comes from the reel's video, never from the app."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-400">
              <tr>
                <th scope="col" className="pb-2 pr-3 font-semibold">Reel length</th>
                <th scope="col" className="pb-2 pr-3 font-semibold">Coins</th>
                <th scope="col" className="pb-2"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {form.reel.tiers.map((tier, i) => {
                const from = i === 0 ? 1 : form.reel.tiers[i - 1].upToSeconds + 1;
                return (
                  <tr key={i} className="border-t border-[#1e283b]">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2 whitespace-nowrap text-neutral-300">
                        <span>{from}s to</span>
                        <div className="w-28">
                          <Num label={`Tier ${i + 1} ends at`} hideLabel suffix="s" value={tier.upToSeconds} onChange={(v) => update((c) => void (c.reel.tiers[i].upToSeconds = v))} compact />
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="w-32">
                        <Num label={`Coins for reels up to ${tier.upToSeconds}s`} hideLabel suffix="coins" value={tier.coins} onChange={(v) => update((c) => void (c.reel.tiers[i].coins = v))} compact />
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      {form.reel.tiers.length > 1 && (
                        <IconBtn label={`Remove the ${tier.upToSeconds}s tier`} onClick={() => update((c) => void c.reel.tiers.splice(i, 1))}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </IconBtn>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-[#1e283b]">
                <td className="py-2 pr-3 text-neutral-300">Longer than {form.reel.tiers[form.reel.tiers.length - 1]?.upToSeconds ?? 0}s</td>
                <td className="py-2 pr-3">
                  <div className="w-32">
                    <Num label="Coins for longer reels" hideLabel suffix="coins" value={form.reel.longerThanLastTier} onChange={(v) => update((c) => void (c.reel.longerThanLastTier = v))} compact />
                  </div>
                </td>
                <td />
              </tr>
              <tr className="border-t border-[#1e283b]">
                <td className="py-2 pr-3 text-neutral-300">Length unknown</td>
                <td className="py-2 pr-3">
                  <div className="w-32">
                    <Num label="Coins when the length is unknown" hideLabel suffix="coins" value={form.reel.unknownLength} onChange={(v) => update((c) => void (c.reel.unknownLength = v))} compact />
                  </div>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {form.reel.tiers.length < 12 && (
          <AddBtn
            onClick={() =>
              update((c) => {
                const last = c.reel.tiers[c.reel.tiers.length - 1];
                c.reel.tiers.push({ upToSeconds: (last?.upToSeconds ?? 0) + 30, coins: c.reel.longerThanLastTier });
              })
            }
          >
            Add a length tier
          </AddBtn>
        )}

        <div className="grid gap-3 border-t border-[#1e283b] pt-4 sm:grid-cols-3">
          <Num label="Reels per day" value={form.reel.maxPerDay} onChange={(v) => update((c) => void (c.reel.maxPerDay = v))} hint="0 turns reel rewards off." />
          <Num label="Minimum watched" suffix="%" value={form.reel.minWatchPercent} onChange={(v) => update((c) => void (c.reel.minWatchPercent = v))} hint="Of the reel's length, between start and claim." />
          <Num label="Older app versions" suffix="coins" value={form.reel.noTokenCoins} onChange={(v) => update((c) => void (c.reel.noTokenCoins = v))} hint="Per reel, for apps that don't report watch time yet." />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-neutral-200">Watch-time check</legend>
          <div className="grid gap-2 md:grid-cols-3">
            {(
              [
                ["off", "Off", "Reels pay by length as soon as they're claimed."],
                ["optional", "On for updated apps", "Updated apps must watch the minimum before claiming; older apps get the 'older app versions' amount."],
                ["required", "Required", "Claims without a watch-time check are refused (only once everyone has the updated app)."],
              ] as [WatchTokenMode, string, string][]
            ).map(([value, label, help]) => (
              <label
                key={value}
                className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm ${
                  form.reel.watchTokenMode === value ? "border-purple-400 bg-purple-500/10" : "border-[#2b3850] hover:border-[#3a4760]"
                }`}
              >
                <input
                  type="radio"
                  name="watchTokenMode"
                  checked={form.reel.watchTokenMode === value}
                  onChange={() => update((c) => void (c.reel.watchTokenMode = value))}
                  className="mt-0.5 accent-purple-500"
                />
                <span>
                  <span className="block font-semibold text-white">{label}</span>
                  <span className="text-xs text-neutral-400">{help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Summary>
          Examples: a 25s reel pays {reelCoinsForDuration(form.reel, 25)}, 55s pays {reelCoinsForDuration(form.reel, 55)}, 85s pays{" "}
          {reelCoinsForDuration(form.reel, 85)}, 115s pays {reelCoinsForDuration(form.reel, 115)}, 3 min pays {reelCoinsForDuration(form.reel, 180)} coins.
          At most {reelDailyMax.toLocaleString()} coins per user per day from reels.
        </Summary>
      </Card>

      <Card
        icon={<UserPlus className="h-4 w-4 text-emerald-300" />}
        title="Referrals"
        description="Users share their code; a new user enters it in their first days. Both get paid once the new user meets the rules below, not at sign-up, so fake accounts don't earn anything."
      >
        <Toggle label="Referrals are on" checked={form.referral.enabled} onChange={(v) => update((c) => void (c.referral.enabled = v))} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Num label="Person who invited" suffix="coins" value={form.referral.referrerCoins} onChange={(v) => update((c) => void (c.referral.referrerCoins = v))} />
          <Num label="New user" suffix="coins" value={form.referral.refereeCoins} onChange={(v) => update((c) => void (c.referral.refereeCoins = v))} />
          <Num label="Code can be entered within" suffix="days" value={form.referral.applyWithinDays} onChange={(v) => update((c) => void (c.referral.applyWithinDays = v))} hint="Of creating the account. 0 = any time." />
        </div>
        <fieldset className="space-y-3 rounded-xl border border-[#1e283b] p-3">
          <legend className="px-1 text-sm font-medium text-neutral-200">The new user qualifies when they</legend>
          <Toggle label="have linked a Google account" checked={form.referral.qualify.requireGoogleLink} onChange={(v) => update((c) => void (c.referral.qualify.requireGoogleLink = v))} />
          <div className="max-w-xs">
            <Num label="and earned rewards for at least" suffix="reels" value={form.referral.qualify.minReelsWatched} onChange={(v) => update((c) => void (c.referral.qualify.minReelsWatched = v))} />
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Num label="Paid referrals per person per day" value={form.referral.maxRewardsPerReferrerPerDay} onChange={(v) => update((c) => void (c.referral.maxRewardsPerReferrerPerDay = v))} hint="More wait until the next day." />
          <Num label="Paid referrals per person in total" value={form.referral.maxRewardsPerReferrer} onChange={(v) => update((c) => void (c.referral.maxRewardsPerReferrer = v))} hint="0 = no limit." />
        </div>
        <TextInput
          label="Share link (optional)"
          value={form.referral.shareLinkTemplate}
          onChange={(v) => update((c) => void (c.referral.shareLinkTemplate = v))}
          placeholder="https://play.google.com/store/apps/details?id=…&referrer=code%3D{code}"
          hint="{code} is replaced with each user's code. Leave empty if the app builds its own link."
        />
      </Card>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-64 right-0 z-20 border-t border-[#1e283b] bg-[#0b1019]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-sm" aria-live="polite">
            {errors.length > 0 ? (
              <span role="alert" className="flex items-start gap-2 text-rose-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errors.slice(0, 3).join(". ")}{errors.length > 3 ? ` (+${errors.length - 3} more)` : ""}</span>
              </span>
            ) : notice ? (
              <span className="flex items-center gap-2 text-emerald-300">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {notice}
                <button type="button" onClick={() => setNotice("")} aria-label="Dismiss" className="rounded p-0.5 hover:bg-white/10">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            ) : dirty ? (
              <span className="text-amber-200">You have unsaved changes.</span>
            ) : (
              <span className="text-neutral-400">All changes saved.</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => {
                setForm(structuredClone(saved));
                setErrors([]);
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#1a2232] px-4 text-sm font-semibold text-neutral-200 hover:bg-[#232d41] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Undo changes
            </button>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={save}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-purple-600 px-5 text-sm font-bold text-white hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              Save rewards
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ icon, title, description, children }: { icon: React.ReactNode; title: string; description?: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-4 rounded-2xl border border-[#1e283b] bg-[#0f141f] p-5">
      <div>
        <h2 id={id} className="flex items-center gap-2 text-base font-bold text-white">
          {icon}
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-neutral-400">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Num({
  label,
  value,
  onChange,
  suffix,
  hint,
  compact,
  hideLabel,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  hint?: string;
  compact?: boolean;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={hideLabel ? "sr-only" : `block font-medium text-neutral-200 ${compact ? "text-xs" : "text-sm"}`}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? NaN : Math.floor(Number(e.target.value)))}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={`${inputClass} font-mono ${suffix ? (suffix.length <= 2 ? "pr-7" : "pr-14") : ""}`}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">{suffix}</span>}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-neutral-400">
          {hint}
        </p>
      )}
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-neutral-200">
        {label}
      </label>
      <input id={id} type="url" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-describedby={`${id}-hint`} className={inputClass} />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-neutral-400">
          {hint}
        </p>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 ${checked ? "bg-emerald-500" : "bg-[#3a4760]"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
      <label htmlFor={id} className="cursor-pointer select-none text-sm text-neutral-200">
        {label}
      </label>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#161c28] text-rose-300 hover:bg-rose-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
    >
      {children}
    </button>
  );
}

function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-[#3a4760] px-3 text-sm font-semibold text-neutral-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
    >
      <Plus className="h-4 w-4" aria-hidden="true" /> {children}
    </button>
  );
}

function Summary({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-[#121a29] px-3 py-2 text-xs text-neutral-300">{children}</p>;
}
