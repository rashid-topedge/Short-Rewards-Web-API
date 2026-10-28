import crypto from "node:crypto";

/**
 * Admin-console session tokens (cookie `dramflix_admin_session`).
 *
 * Pure crypto: the caller passes the signing secret (lib/adminSecret.ts keeps
 * it in the database). Used by proxy.ts (to route moderators away from
 * admin-only pages) and by lib/auth.ts (which additionally checks the account
 * in the database, so a disabled moderator is signed out immediately).
 *
 * Format v2: "v2." + base64url(JSON payload) + "." + hex HMAC-SHA256
 *   payload = { sid, role, ver, iat }
 *   sid  = "admin" for the .env admin, or "mod:<id>" for a moderator
 *   ver  = the moderator's session_version (bumped on password reset / disable)
 *
 * The older admin-only format ("<b64 ts:random>.<hex sig>") is still accepted
 * as an admin session until it expires, so the current admin isn't logged out.
 */

export const COOKIE_NAME = "dramflix_admin_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type StaffRole = "admin" | "moderator";

export type TokenPayload = {
  sid: string;
  role: StaffRole;
  ver: number;
  iat: number;
};

function sign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(a) || !/^[0-9a-f]{64}$/.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export function createStaffToken(secret: string, sid: string, role: StaffRole, ver: number): string {
  const payload = Buffer.from(JSON.stringify({ sid, role, ver, iat: Date.now() })).toString("base64url");
  return `v2.${payload}.${sign(`v2.${payload}`, secret)}`;
}

/** Verifies signature and expiry only. Returns the payload or null. */
export function readStaffToken(token: string | null | undefined, secret: string): TokenPayload | null {
  if (!token || !secret) return null;

  if (token.startsWith("v2.")) {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [, payload, signature] = parts;
    if (!safeEqualHex(signature, sign(`v2.${payload}`, secret))) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<TokenPayload>;
      if (typeof data.sid !== "string" || typeof data.iat !== "number" || typeof data.ver !== "number") return null;
      if (data.role !== "admin" && data.role !== "moderator") return null;
      if (Date.now() - data.iat > SESSION_TTL_MS) return null;
      return { sid: data.sid, role: data.role, ver: data.ver, iat: data.iat };
    } catch {
      return null;
    }
  }

  // Legacy admin token: base64url("<timestamp>:<random>") + "." + hex signature
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  try {
    const payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
    if (!safeEqualHex(signature, sign(payload, secret))) return null;
    const iat = Number(payload.split(":")[0]);
    if (!Number.isFinite(iat) || Date.now() - iat > SESSION_TTL_MS) return null;
    return { sid: "admin", role: "admin", ver: 0, iat };
  } catch {
    return null;
  }
}
