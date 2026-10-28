import crypto from "node:crypto";
import { initAdminConfig, setAdminConfig } from "@/lib/db";

/**
 * The key that signs admin-console sessions, stored in the database
 * (admin_config.session_secret) instead of an environment variable.
 *
 * Created automatically on first use. If ADMIN_SECRET is still set in the
 * environment at that moment it is copied (so nobody is signed out by the
 * move); after that the variable is ignored and can be deleted.
 *
 * Rotating it signs everyone out. Each server instance caches it for up to
 * a minute, so other instances pick up a rotation within that time.
 */

const KEY = "session_secret";
const CACHE_MS = 60_000;
// The old built-in fallback was public, so it is never imported.
const OLD_PUBLIC_DEFAULT = "dramflix_admin_secret_key_987654321";

let cached: { value: string; at: number } | null = null;
let loading: Promise<string> | null = null;

function newSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function getSessionSecret(): Promise<string> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  if (!loading) {
    loading = (async () => {
      const fromEnv = process.env.ADMIN_SECRET?.trim();
      const initial = fromEnv && fromEnv.length >= 16 && fromEnv !== OLD_PUBLIC_DEFAULT ? fromEnv : newSecret();
      const value = await initAdminConfig(KEY, initial);
      cached = { value, at: Date.now() };
      return value;
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

/** Replaces the secret: every console session (admin and moderators) must sign in again. */
export async function rotateSessionSecret(): Promise<string> {
  const value = newSecret();
  await setAdminConfig(KEY, value);
  cached = { value, at: Date.now() };
  return value;
}
