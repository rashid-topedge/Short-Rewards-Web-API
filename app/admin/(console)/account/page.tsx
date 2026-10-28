"use client";

import React, { useEffect, useId, useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";

const inputClass =
  "h-11 w-full rounded-xl border border-[#2b3850] bg-[#161c28] px-3 text-sm text-white placeholder:text-neutral-500 focus:border-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60";

type Account = { username: string; displayName: string; lastLoginAt: number | null };

export default function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/admin/account");
      if (!res.ok) throw new Error();
      setAccount(await res.json());
    } catch {
      setLoadError("Couldn't load your account. Refresh the page to try again.");
    }
  };
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-2xl space-y-6 text-neutral-100">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-white">
          <KeyRound className="h-6 w-6 text-purple-300" aria-hidden="true" /> My account
        </h1>
        <p className="mt-1 text-sm text-neutral-300">
          Your admin sign-in is stored in the database. Changes here take effect immediately, with no redeploy.
        </p>
      </div>

      {loadError && (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {loadError}
        </p>
      )}
      {!account && !loadError && (
        <div className="flex items-center gap-2 py-10 text-sm text-neutral-300" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-purple-400" aria-hidden="true" /> Loading…
        </div>
      )}
      {account && (
        <>
          <DetailsForm account={account} onSaved={load} />
          <PasswordForm />
          <SignOutEveryone />
        </>
      )}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-4 rounded-2xl border border-[#1e283b] bg-[#0f141f] p-5">
      <div>
        <h2 id={id} className="text-base font-bold text-white">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-neutral-400">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-neutral-200">
        {label}
      </label>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={inputClass} {...props} />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-neutral-400">
          {hint}
        </p>
      )}
    </div>
  );
}

function Result({ error, success }: { error: string; success: string }) {
  if (error)
    return (
      <p role="alert" className="flex items-start gap-2 text-sm text-rose-200">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
      </p>
    );
  if (success)
    return (
      <p role="status" className="flex items-start gap-2 text-sm text-emerald-300">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {success}
      </p>
    );
  return null;
}

async function saveAccount(body: Record<string, string>): Promise<{ ok: boolean; error?: string; changed?: boolean }> {
  try {
    const res = await fetch("/api/admin/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; changed?: boolean };
    return res.ok ? { ok: true, changed: data.changed } : { ok: false, error: data.error || "Couldn't save your changes." };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="inline-flex h-11 items-center gap-2 rounded-xl bg-purple-600 px-5 text-sm font-bold text-white hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 disabled:opacity-50"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

function DetailsForm({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const [username, setUsername] = useState(account.username);
  const [displayName, setDisplayName] = useState(account.displayName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!currentPassword) return setError("Enter your current password to confirm.");
    setBusy(true);
    const r = await saveAccount({ currentPassword, username: username.trim(), displayName: displayName.trim() });
    setBusy(false);
    if (!r.ok) return setError(r.error || "Couldn't save your changes.");
    setCurrentPassword("");
    setSuccess(r.changed ? "Saved. Use your new username the next time you sign in." : "Nothing to change.");
    onSaved();
  };

  return (
    <Section title="Sign-in details" description="The username you sign in with, and the name shown on reels and in the activity log.">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            hint="3–32 characters: letters, numbers, dot, dash or underscore."
          />
          <Field label="Display name" value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <Field
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
        />
        <Result error={error} success={success} />
        <SubmitButton busy={busy}>Save details</SubmitButton>
      </form>
    </Section>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!currentPassword) return setError("Enter your current password.");
    if (newPassword.length < 10 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return setError("New password must be at least 10 characters, with letters and numbers.");
    }
    if (newPassword !== confirm) return setError("The two new passwords don't match.");
    setBusy(true);
    const r = await saveAccount({ currentPassword, newPassword });
    setBusy(false);
    if (!r.ok) return setError(r.error || "Couldn't change your password.");
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
    setSuccess("Password changed. You're still signed in here; your other admin sessions were signed out.");
  };

  return (
    <Section title="Change password">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            hint="At least 10 characters, with letters and numbers."
          />
          <Field
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <Result error={error} success={success} />
        <SubmitButton busy={busy}>Change password</SubmitButton>
      </form>
    </Section>
  );
}

function SignOutEveryone() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const run = async () => {
    if (!window.confirm("Sign everyone out of the console? All moderators (and your other devices) will need to sign in again.")) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/account/sign-out-everyone", { method: "POST" });
      if (!res.ok) throw new Error();
      setSuccess("Done. Everyone else has been signed out; you're still signed in here.");
    } catch {
      setError("Couldn't sign everyone out. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Sign everyone out"
      description="Creates a new session key in the database. Use it if you think a moderator's or your own session was shared or a device was lost."
    >
      <Result error={error} success={success} />
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-rose-500/50 px-4 text-sm font-bold text-rose-200 hover:bg-rose-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
        Sign everyone out
      </button>
      <p className="flex items-center gap-2 text-xs text-neutral-400">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Other servers pick up the new key within a minute.
      </p>
    </Section>
  );
}
