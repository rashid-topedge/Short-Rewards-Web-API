import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createRefreshToken, isUserClaimed } from "@/lib/db";

/**
 * App-user authentication.
 *
 * Sessions use two tokens:
 * - Access token: a standard HS256 JWT, valid ACCESS_TOKEN_TTL_SECONDS (30 min).
 *   Sent on every request as `Authorization: Bearer <accessToken>` and checked
 *   by signature alone (no database lookup), so it scales freely.
 * - Refresh token: an opaque random string, valid REFRESH_TOKEN_TTL_DAYS and
 *   stored hashed in the database. POST /api/user/refresh swaps it for a new
 *   pair (rotation). Deleting a user's refresh tokens logs them out everywhere
 *   within one access-token lifetime.
 *
 * Accounts start anonymous (POST /api/user/sync) and can be linked to a Google
 * account (POST /api/user/link-google), which lets the user recover them on a
 * new device (POST /api/user/login-google).
 *
 * Transition: while USER_AUTH_ALLOW_LEGACY=true we also accept
 *  - the earlier non-expiring token format, and
 *  - requests with no token but a body/query `userId`, for accounts that have
 *    never been issued a token.
 * Turn it off once the updated app is out.
 */

export const ACCESS_TOKEN_TTL_SECONDS = 30 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 180;

// Server-generated ids look like u_<32 hex>; the looser pattern also admits ids older app builds created.
const USER_ID_PATTERN = /^[A-Za-z0-9_.:@-]{4,128}$/;

function getSecret(): string {
  const secret = process.env.USER_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("USER_TOKEN_SECRET is not set (or shorter than 32 characters).");
  }
  return secret;
}

/** Separate keys per purpose, derived from the one secret. */
function key(purpose: "access-jwt" | "legacy"): Buffer | string {
  const secret = getSecret();
  if (purpose === "legacy") return secret; // the earlier token format signed with the raw secret
  return crypto.createHmac("sha256", secret).update(`short-reward:${purpose}`).digest();
}

export function isValidUserId(userId: unknown): userId is string {
  return typeof userId === "string" && USER_ID_PATTERN.test(userId);
}

export function generateUserId(): string {
  return `u_${crypto.randomUUID().replace(/-/g, "")}`;
}

function legacyAllowed(): boolean {
  return process.env.USER_AUTH_ALLOW_LEGACY === "true";
}

// ------------------------------------------------------------------
// Access tokens (JWT, HS256)

const JWT_HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

export function signAccessToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, iat: now, exp: now + ACCESS_TOKEN_TTL_SECONDS, typ: "access" })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", key("access-jwt")).update(`${JWT_HEADER}.${payload}`).digest("base64url");
  return `${JWT_HEADER}.${payload}.${signature}`;
}

export type AccessTokenCheck = { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" };

export function verifyAccessToken(token: string): AccessTokenCheck {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "invalid" };
  const [header, payload, signature] = parts;
  if (header !== JWT_HEADER) return { ok: false, reason: "invalid" };

  const expected = crypto.createHmac("sha256", key("access-jwt")).update(`${header}.${payload}`).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64url");
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: unknown;
      exp?: unknown;
      typ?: unknown;
    };
    if (data.typ !== "access" || !isValidUserId(data.sub) || typeof data.exp !== "number") {
      return { ok: false, reason: "invalid" };
    }
    if (data.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "expired" };
    return { ok: true, userId: data.sub };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

/** The earlier non-expiring format: base64url(JSON {uid, iat}) + "." + hex HMAC. Accepted only in legacy mode. */
function verifyLegacyToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!/^[0-9a-f]{64}$/.test(signature)) return null;
  const expected = crypto.createHmac("sha256", key("legacy")).update(payload).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: unknown };
    return isValidUserId(data.uid) ? data.uid : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// Sessions

export type Session = {
  accessToken: string;
  accessTokenExpiresIn: number; // seconds
  refreshToken: string;
  refreshTokenExpiresIn: number; // seconds
};

export function hashRefreshToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function newRefreshTokenValue(): string {
  return `rt_${crypto.randomBytes(32).toString("base64url")}`;
}

/** Starts a new login session (new refresh-token family) for the user. */
export async function issueSession(userId: string): Promise<Session> {
  const raw = newRefreshTokenValue();
  await createRefreshToken({
    userId,
    tokenHash: hashRefreshToken(raw),
    familyId: crypto.randomUUID(),
    ttlMs: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
  return sessionFor(userId, raw);
}

export function sessionFor(userId: string, refreshToken: string): Session {
  return {
    accessToken: signAccessToken(userId),
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    refreshTokenExpiresIn: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  };
}

// ------------------------------------------------------------------
// Request auth

export function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    return token || null;
  }
  return null;
}

export type UserAuthResult =
  | { ok: true; userId: string; viaToken: boolean }
  | { ok: false; response: NextResponse };

export function authError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

function unauthorized(code: string, message: string): UserAuthResult {
  return { ok: false, response: authError(401, code, message) };
}

/**
 * Resolves the calling user.
 * Error codes for the app: TOKEN_EXPIRED (call /api/user/refresh, then retry),
 * TOKEN_INVALID / AUTH_REQUIRED (sign in again).
 * @param legacyUserId the userId old app builds send in the body/query; only
 *   used when there is no token and legacy mode is on.
 */
export async function requireUser(req: NextRequest, legacyUserId?: unknown): Promise<UserAuthResult> {
  const token = getBearerToken(req);

  if (token) {
    const check = verifyAccessToken(token);
    if (check.ok) return { ok: true, userId: check.userId, viaToken: true };
    if (check.reason === "expired") return unauthorized("TOKEN_EXPIRED", "Access token expired; refresh it");
    if (legacyAllowed()) {
      const legacyUser = verifyLegacyToken(token);
      if (legacyUser) return { ok: true, userId: legacyUser, viaToken: true };
    }
    return unauthorized("TOKEN_INVALID", "Invalid access token");
  }

  if (legacyAllowed() && isValidUserId(legacyUserId)) {
    if (await isUserClaimed(legacyUserId)) {
      return unauthorized("AUTH_REQUIRED", "This account requires an Authorization: Bearer token");
    }
    return { ok: true, userId: legacyUserId, viaToken: false };
  }

  return unauthorized("AUTH_REQUIRED", "Missing Authorization: Bearer token");
}
