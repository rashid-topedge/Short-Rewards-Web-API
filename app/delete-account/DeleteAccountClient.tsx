"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type Status = { email: string | null; deletionRequestedAt: number | null; deletionDueAt: number | null };

type GoogleId = {
  accounts: {
    id: {
      initialize: (o: Record<string, unknown>) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    };
  };
};

const ENDPOINT = "/api/user/account/delete-web";

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
}

/**
 * Google sign-in uses redirect mode (no popup, so it also works where popups are
 * blocked, e.g. in-app browsers): Google posts the sign-in to
 * /api/user/account/delete-web/google, which keeps it in a short-lived cookie and
 * sends the person back here.
 */
export default function DeleteAccountClient({ clientId }: { clientId: string | null }) {
  const button = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  // null = checking, false = needs sign-in, true = signed in (status loaded)
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const call = useCallback(async (action: "status" | "request" | "cancel" | "signout") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (action === "signout") {
        setStatus(null);
        setSignedIn(false);
        return;
      }
      if (res.status === 401) {
        setSignedIn(false);
        setStatus(null);
        if (data.code !== "NOT_SIGNED_IN") setError(data.error || "Please sign in with Google again.");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        // Still signed in (e.g. no account for this Google account): let them switch accounts.
        if (data.code === "NO_ACCOUNT") setSignedIn(true);
        return;
      }
      setStatus(data as Status);
      setSignedIn(true);
      setConfirming(false);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  // Coming back from Google: show sign-in errors, then check whether we're signed in.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      window.history.replaceState(null, "", window.location.pathname);
      if (err === "config") setError("Google sign-in isn't available right now. Please use the app.");
      else setError("Google sign-in didn't complete. Please try again.");
    }
    void call("status");
  }, [call]);

  useEffect(() => {
    const g = (window as unknown as { google?: GoogleId }).google;
    if (!scriptReady || !clientId || !g || !button.current || signedIn !== false) return;
    g.accounts.id.initialize({
      client_id: clientId,
      ux_mode: "redirect",
      login_uri: `${window.location.origin}${ENDPOINT}/google`,
    });
    g.accounts.id.renderButton(button.current, { theme: "filled_black", size: "large", text: "signin_with", shape: "pill" });
  }, [scriptReady, clientId, signedIn]);

  if (!clientId) {
    return <p className="mt-4 text-sm text-amber-200">Google sign-in isn&apos;t available right now. Please use the app.</p>;
  }

  const pending = Boolean(status?.deletionDueAt);

  return (
    <div className="mt-4">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setScriptReady(true)} />

      {signedIn === false && <div ref={button} className="min-h-11" />}

      {(busy || signedIn === null) && (
        <p className="mt-3 text-sm text-zinc-400" role="status">
          Please wait…
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100" role="alert">
          {error}
        </p>
      )}

      {signedIn && (
        <div className="mt-2 space-y-3" aria-live="polite">
          {status && (
            <>
              {status.email && (
                <p className="text-sm text-zinc-400">
                  Signed in as <span className="text-zinc-200">{status.email}</span>
                </p>
              )}

              {pending ? (
                <>
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    Your account will be deleted on <strong>{formatDate(status.deletionDueAt!)}</strong>.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void call("cancel")}
                    className="h-11 rounded-xl bg-white px-5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50"
                  >
                    Keep my account
                  </button>
                </>
              ) : confirming ? (
                <div className="space-y-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
                  <p className="text-sm text-rose-100">
                    Delete this account and its coins? You&apos;ll be signed out everywhere, and after 7 days this can&apos;t
                    be undone.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void call("request")}
                      className="h-11 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-50"
                    >
                      Yes, delete my account
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="h-11 rounded-xl bg-zinc-800 px-5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(true)}
                  className="h-11 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-50"
                >
                  Delete my account
                </button>
              )}
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void call("signout")}
            className="block text-sm text-zinc-400 underline underline-offset-4 hover:text-zinc-200 disabled:opacity-50"
          >
            Use a different Google account
          </button>
        </div>
      )}
    </div>
  );
}
