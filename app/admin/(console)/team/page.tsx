"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  ShieldMinus,
  ShieldPlus,
  Trash2,
  UserCog,
  UserX,
  UserCheck,
  X,
} from "lucide-react";
import type { StaffAccountInfo as BaseAccount } from "@/lib/types";

/** Team rows from the API: `canManage` is false for accounts a lead moderator can't change. */
type StaffAccountInfo = BaseAccount & { canManage?: boolean };
type Viewer = { role: "admin" | "moderator"; lead: boolean; accountId: number };

const inputClass =
  "h-11 w-full rounded-xl border border-[#2b3850] bg-[#161c28] px-3 text-sm text-white placeholder:text-neutral-500 focus:border-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60";

function formatWhen(ts: number | null): string {
  if (!ts) return "Never";
  return new Date(ts).toLocaleString();
}

type DialogState =
  | { kind: "create" }
  | { kind: "rename"; account: StaffAccountInfo }
  | { kind: "password"; account: StaffAccountInfo }
  | null;

export default function TeamPage() {
  const [accounts, setAccounts] = useState<StaffAccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const isAdmin = viewer?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/team");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items?: StaffAccountInfo[]; viewer?: Viewer };
      setAccounts(data.items || []);
      setViewer(data.viewer ?? null);
    } catch {
      setLoadError("Couldn't load the team. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patchAccount = async (a: StaffAccountInfo, body: Record<string, unknown>, success: string) => {
    const res = await fetch(`/api/admin/team/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error || "Could not update the account");
    setNotice(success);
    load();
  };

  const toggleDisabled = async (a: StaffAccountInfo) => {
    if (!a.disabled && !window.confirm(`Disable ${a.displayName}? They'll be signed out right away and can't sign in until you re-enable them.`)) return;
    try {
      await patchAccount(a, { disabled: !a.disabled }, a.disabled ? `${a.displayName} can sign in again.` : `${a.displayName} is disabled and signed out.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not update the account");
    }
  };

  const toggleLead = async (a: StaffAccountInfo) => {
    const ask = a.lead
      ? `Remove lead moderator from ${a.displayName}? They'll keep their own reels but lose Rewards and Team.`
      : `Make ${a.displayName} a lead moderator? They'll be able to add and manage moderators, edit, unpublish and delete other moderators' reels, and change reward settings.`;
    if (!window.confirm(ask)) return;
    try {
      await patchAccount(a, { lead: !a.lead }, a.lead ? `${a.displayName} is a regular moderator again.` : `${a.displayName} is now a lead moderator.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not update the account");
    }
  };

  const remove = async (a: StaffAccountInfo) => {
    if (!window.confirm(`Remove ${a.displayName} (@${a.username})? Their login is deleted. Reels they uploaded stay and keep showing their name.`)) return;
    const res = await fetch(`/api/admin/team/${a.id}`, { method: "DELETE" });
    setNotice(res.ok ? `${a.displayName} removed.` : "Could not remove the account.");
    if (res.ok) load();
  };

  return (
    <div className="space-y-6 text-neutral-100">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-white">
            <UserCog className="h-6 w-6 text-purple-300" aria-hidden="true" /> Team
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-300">
            <strong className="text-white">Moderators</strong> use the Reels page: they upload, publish, edit and delete
            their own reels only. <strong className="text-white">Lead moderators</strong> also get Payouts, Rewards and
            Team: they confirm or reject payouts and upload payment screenshots, add and manage moderators, and edit,
            unpublish or delete moderators&apos; reels (not the admin&apos;s or another lead&apos;s).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ kind: "create" })}
          className="inline-flex h-11 items-center gap-2 self-start rounded-xl bg-purple-600 px-4 text-sm font-bold text-white shadow-lg shadow-purple-900/40 hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 md:self-auto"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add moderator
        </button>
      </div>

      <div role="status" aria-live="polite" className={notice ? "" : "sr-only"}>
        {notice && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#2b3850] bg-[#121a29] px-4 py-3 text-sm text-neutral-100">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice("")}
              className="rounded p-1 text-neutral-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              aria-label="Dismiss message"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {viewer && (
        <div className="flex items-center gap-3 rounded-2xl border border-[#1e283b] bg-[#0f141f] px-4 py-3 text-sm">
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
          <p className="text-neutral-300">
            {isAdmin ? (
              <>
                <strong className="text-white">Admin</strong> (you) has full access. Use the shield button on a moderator
                to make them a lead moderator. Change your own sign-in on My Account.
              </>
            ) : (
              <>
                You&apos;re a <strong className="text-white">lead moderator</strong>. You can add moderators and reset,
                disable or remove them. Only the admin can change lead moderators.
              </>
            )}
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-300" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-purple-400" aria-hidden="true" /> Loading team…
        </div>
      ) : loadError ? (
        <div role="alert" className="space-y-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 py-10 text-center">
          <p className="text-sm text-rose-100">{loadError}</p>
          <button type="button" onClick={load} className="h-10 rounded-xl bg-rose-500/20 px-4 text-sm font-semibold text-rose-50 hover:bg-rose-500/30">
            Try again
          </button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="space-y-2 rounded-2xl border border-[#1e283b] bg-[#0f141f] py-14 text-center">
          <UserCog className="mx-auto h-10 w-10 text-neutral-500" aria-hidden="true" />
          <p className="font-semibold text-neutral-200">No moderators yet</p>
          <p className="text-sm text-neutral-400">Add one to let someone else upload and edit reels.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#1e283b] bg-[#0f141f]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-[#1e283b] text-xs uppercase tracking-wide text-neutral-400">
              <tr>
                <th scope="col" className="px-4 py-3">Moderator</th>
                <th scope="col" className="px-4 py-3">Role</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Last sign-in</th>
                <th scope="col" className="px-4 py-3">Added</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e283b]">
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-white">{a.displayName}</p>
                    <p className="font-mono text-xs text-neutral-400">
                      @{a.username}
                      {viewer && a.id === viewer.accountId && " (you)"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {a.lead ? (
                      <span className="inline-flex rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-bold text-purple-200">
                        Lead moderator
                      </span>
                    ) : (
                      <span className="text-neutral-300">Moderator</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                        a.disabled ? "bg-neutral-600 text-white" : "bg-emerald-500/20 text-emerald-300"
                      }`}
                    >
                      {a.disabled ? "Disabled" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-300">{formatWhen(a.lastLoginAt)}</td>
                  <td className="px-4 py-3 text-neutral-300">{new Date(a.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {a.canManage === false ? (
                      <p className="text-right text-xs text-neutral-500">Admin only</p>
                    ) : (
                    <div className="flex justify-end gap-1">
                      {isAdmin && (
                        <ActionButton
                          label={a.lead ? `Remove lead moderator from ${a.displayName}` : `Make ${a.displayName} a lead moderator`}
                          onClick={() => toggleLead(a)}
                          className={a.lead ? "text-purple-200" : "text-neutral-200"}
                        >
                          {a.lead ? <ShieldMinus className="h-4 w-4" aria-hidden="true" /> : <ShieldPlus className="h-4 w-4" aria-hidden="true" />}
                        </ActionButton>
                      )}
                      <ActionButton label={`Rename ${a.displayName}`} onClick={() => setDialog({ kind: "rename", account: a })}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </ActionButton>
                      <ActionButton label={`Reset password for ${a.displayName}`} onClick={() => setDialog({ kind: "password", account: a })}>
                        <KeyRound className="h-4 w-4" aria-hidden="true" />
                      </ActionButton>
                      <ActionButton
                        label={a.disabled ? `Enable ${a.displayName}` : `Disable ${a.displayName}`}
                        onClick={() => toggleDisabled(a)}
                        className={a.disabled ? "text-emerald-300" : "text-amber-300"}
                      >
                        {a.disabled ? <UserCheck className="h-4 w-4" aria-hidden="true" /> : <UserX className="h-4 w-4" aria-hidden="true" />}
                      </ActionButton>
                      <ActionButton label={`Remove ${a.displayName}`} onClick={() => remove(a)} className="text-rose-300 hover:bg-rose-500/15">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </ActionButton>
                    </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AccountDialog
        state={dialog}
        canCreateLead={isAdmin}
        onClose={() => setDialog(null)}
        onDone={(msg) => {
          setDialog(null);
          setNotice(msg);
          load();
        }}
      />
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  className = "text-neutral-200",
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-lg bg-[#161c28] hover:bg-[#232d41] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${className}`}
    >
      {children}
    </button>
  );
}

function AccountDialog({
  state,
  canCreateLead,
  onClose,
  onDone,
}: {
  state: DialogState;
  canCreateLead: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const userId = useId();
  const nameId = useId();
  const passId = useId();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [lead, setLead] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (state && !dlg.open) dlg.showModal();
    if (!state && dlg.open) dlg.close();
    setError("");
    setSaving(false);
    setUsername("");
    setPassword("");
    setLead(false);
    setDisplayName(state && state.kind === "rename" ? state.account.displayName : "");
  }, [state]);

  const generate = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(14));
    let pw = Array.from(bytes, (b) => chars[b % chars.length]).join("");
    if (!/[0-9]/.test(pw)) pw = pw.slice(0, -1) + "7";
    setPassword(pw);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state) return;
    setSaving(true);
    setError("");
    try {
      let res: Response;
      if (state.kind === "create") {
        res = await fetch("/api/admin/team", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), displayName: displayName.trim(), password, lead: canCreateLead && lead }),
        });
      } else {
        res = await fetch(`/api/admin/team/${state.account.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state.kind === "rename" ? { displayName: displayName.trim() } : { password }),
        });
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save");
      onDone(
        state.kind === "create"
          ? `${canCreateLead && lead ? "Lead moderator" : "Moderator"} @${username.trim()} added. Share the username and password with them privately.`
          : state.kind === "rename"
          ? "Name updated."
          : `Password reset for ${state.account.displayName}. They've been signed out everywhere.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  };

  const title =
    state?.kind === "create" ? "Add moderator" : state?.kind === "rename" ? "Rename moderator" : state ? `Reset password for ${state.account.displayName}` : "";

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onClose();
      }}
      className="m-auto max-h-[100dvh] w-full max-w-md overflow-y-auto overscroll-contain bg-transparent p-2 text-neutral-100 backdrop:bg-black/80 backdrop:backdrop-blur-sm sm:p-4"
    >
      {state && (
        <form onSubmit={submit} noValidate className="space-y-4 rounded-2xl border border-[#26324a] bg-[#0d121c] p-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <h2 id={headingId} className="text-lg font-bold text-white">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
            </div>
          )}

          {state.kind === "create" && (
            <div className="space-y-1.5">
              <label htmlFor={userId} className="block text-sm font-medium text-neutral-200">
                Username
              </label>
              <input
                id={userId}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby={`${userId}-hint`}
                className={`${inputClass} font-mono`}
              />
              <p id={`${userId}-hint`} className="text-xs text-neutral-400">
                3–32 characters: letters, numbers, dot, dash or underscore. Used to sign in.
              </p>
            </div>
          )}

          {(state.kind === "create" || state.kind === "rename") && (
            <div className="space-y-1.5">
              <label htmlFor={nameId} className="block text-sm font-medium text-neutral-200">
                Display name {state.kind === "create" && <span className="font-normal text-neutral-400">(optional)</span>}
              </label>
              <input id={nameId} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} className={inputClass} />
              <p className="text-xs text-neutral-400">Shown on reels they upload and in the activity log.</p>
            </div>
          )}

          {(state.kind === "create" || state.kind === "password") && (
            <div className="space-y-1.5">
              <label htmlFor={passId} className="block text-sm font-medium text-neutral-200">
                {state.kind === "create" ? "Password" : "New password"}
              </label>
              <div className="flex gap-2">
                <input
                  id={passId}
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  spellCheck={false}
                  aria-describedby={`${passId}-hint`}
                  className={`${inputClass} font-mono`}
                />
                <button
                  type="button"
                  onClick={generate}
                  className="h-11 whitespace-nowrap rounded-xl bg-[#232d41] px-3 text-sm font-semibold text-white hover:bg-[#2e3b52] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                >
                  Generate
                </button>
              </div>
              <p id={`${passId}-hint`} className="text-xs text-neutral-400">
                At least 10 characters, with letters and numbers. Copy it now: it can&apos;t be shown again.
              </p>
            </div>
          )}

          {state.kind === "create" && canCreateLead && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[#26324a] bg-[#111827] px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={lead}
                onChange={(e) => setLead(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-purple-500"
              />
              <span>
                <span className="font-medium text-neutral-100">Lead moderator</span>
                <span className="block text-xs text-neutral-400">
                  Can add and manage moderators, edit, unpublish or delete their reels, and change reward settings.
                </span>
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-11 rounded-xl bg-[#1a2232] px-4 text-sm font-semibold text-neutral-200 hover:bg-[#232d41] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-purple-600 px-5 text-sm font-bold text-white hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {state.kind === "create" ? "Add moderator" : state.kind === "rename" ? "Save" : "Reset password"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
