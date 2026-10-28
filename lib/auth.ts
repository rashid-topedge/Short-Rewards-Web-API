import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, createStaffToken, readStaffToken, SESSION_TTL_MS, type StaffRole } from "@/lib/adminToken";
import { getSessionSecret } from "@/lib/adminSecret";
import {
  createAdminAccountIfMissing,
  getAdminAccount,
  getStaffAccount,
  getStaffAccountByUsername,
  recordStaffLogin,
  type StaffAccount,
} from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/passwords";

export { COOKIE_NAME };

/**
 * Admin-console authentication with two roles, both stored in the database
 * (admin_users), so credentials can change without a redeploy:
 * - admin:     one account (role 'admin'); full access. Changed on the Account page.
 * - moderator: accounts created on the Team page; Reels section only.
 *
 * The admin account is created once from ADMIN_USERNAME / ADMIN_PASSWORD if
 * those are set and no admin exists yet; after that the variables are ignored.
 *
 * isAuthenticatedAdmin() is true for admins only, so every admin-only API
 * stays closed to moderators. Routes moderators may use call requireStaff().
 */

export type StaffSession = {
  /** "admin" for the admin account, "mod:<id>" for a moderator. */
  actorId: string;
  role: StaffRole;
  username: string;
  displayName: string;
  /** Database id of the account (admin or moderator). */
  accountId: number;
  /** Set for moderators only. */
  moderatorId: number | null;
};

function sessionForAccount(a: StaffAccount): StaffSession {
  if (a.role === "admin") {
    return {
      actorId: "admin",
      role: "admin",
      username: a.username,
      displayName: a.displayName || "Admin",
      accountId: a.id,
      moderatorId: null,
    };
  }
  return {
    actorId: `mod:${a.id}`,
    role: "moderator",
    username: a.username,
    displayName: a.displayName || a.username,
    accountId: a.id,
    moderatorId: a.id,
  };
}

/** Signs a session token for the account with the database-stored secret. */
export async function issueStaffToken(a: StaffAccount): Promise<string> {
  const secret = await getSessionSecret();
  return a.role === "admin"
    ? createStaffToken(secret, "admin", "admin", a.sessionVersion)
    : createStaffToken(secret, `mod:${a.id}`, "moderator", a.sessionVersion);
}

// ------------------------------------------------------------------
// First-time admin setup

let adminKnownToExist = false;

/**
 * True once an admin account exists. If none does and ADMIN_USERNAME /
 * ADMIN_PASSWORD are set, creates it from them (one time).
 */
export async function ensureAdminAccount(): Promise<boolean> {
  if (adminKnownToExist) return true;
  if (await getAdminAccount()) {
    adminKnownToExist = true;
    return true;
  }
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!username || !password) return false;
  await createAdminAccountIfMissing({ username, displayName: "Admin", passwordHash: hashPassword(password) });
  adminKnownToExist = (await getAdminAccount()) !== null;
  return adminKnownToExist;
}

// ------------------------------------------------------------------
// Login

// Simple in-memory throttle: 5 failed attempts per username + IP per 15 minutes.
// (Keyed by IP too, so someone guessing can't lock the real admin out.)
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const failures = new Map<string, { count: number; first: number }>();

function throttleKey(username: string, ip: string) {
  return `${username.trim().toLowerCase()}|${ip}`;
}

export function loginBlockedFor(username: string, ip = ""): number {
  const f = failures.get(throttleKey(username, ip));
  if (!f || Date.now() - f.first > FAIL_WINDOW_MS || f.count < MAX_FAILS) return 0;
  return Math.ceil((f.first + FAIL_WINDOW_MS - Date.now()) / 1000);
}

function noteFailure(key: string) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > FAIL_WINDOW_MS) failures.set(key, { count: 1, first: Date.now() });
  else f.count++;
  if (failures.size > 5000) failures.clear();
}

/** Checks a username/password against the admin and moderator accounts. */
export async function authenticateStaff(
  username: string,
  password: string,
  ip = ""
): Promise<
  | { ok: true; session: StaffSession; token: string }
  | { ok: false; reason: "invalid" | "disabled" | "no_admin" }
> {
  const u = username.trim();
  const key = throttleKey(u, ip);
  const adminExists = await ensureAdminAccount();

  const account = await getStaffAccountByUsername(u);
  // The admin password imported from the environment was trimmed; accept the same.
  const passwordOk =
    account !== null &&
    (verifyPassword(password, account.passwordHash) ||
      (account.role === "admin" && password !== password.trim() && verifyPassword(password.trim(), account.passwordHash)));
  if (!account || !passwordOk) {
    noteFailure(key);
    return { ok: false, reason: adminExists ? "invalid" : "no_admin" };
  }
  if (account.disabled) return { ok: false, reason: "disabled" };

  failures.delete(key);
  await recordStaffLogin(account.id);
  return { ok: true, session: sessionForAccount(account), token: await issueStaffToken(account) };
}

// ------------------------------------------------------------------
// Session checks

// Accounts are re-checked against the database (disabled? password changed?),
// cached briefly so it isn't a query on every request.
const ACCOUNT_CACHE_MS = 15_000;
const accountCache = new Map<string, { at: number; value: StaffAccount | null }>();

/** Call after changing a moderator account, so the change applies at once. */
export function forgetStaffAccountCache(id: number): void {
  accountCache.delete(`mod:${id}`);
}

/** Call after changing the admin account. */
export function forgetAdminAccountCache(): void {
  accountCache.delete("admin");
}

async function accountForSid(sid: string): Promise<StaffAccount | null> {
  let cached = accountCache.get(sid);
  if (!cached || Date.now() - cached.at > ACCOUNT_CACHE_MS) {
    let value: StaffAccount | null = null;
    if (sid === "admin") {
      value = await getAdminAccount();
    } else {
      const id = Number(sid.replace(/^mod:/, ""));
      if (sid.startsWith("mod:") && Number.isInteger(id) && id > 0) value = await getStaffAccount(id);
    }
    cached = { at: Date.now(), value };
    accountCache.set(sid, cached);
  }
  return cached.value;
}

async function sessionFromToken(token: string | null | undefined): Promise<StaffSession | null> {
  if (!token) return null;
  const payload = readStaffToken(token, await getSessionSecret());
  if (!payload) return null;
  const account = await accountForSid(payload.sid);
  if (!account || account.disabled || account.sessionVersion !== payload.ver) return null;
  if (account.role !== payload.role) return null;
  return sessionForAccount(account);
}

function tokenFromRequest(req?: NextRequest): string | undefined {
  if (!req) return undefined;
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7).trim();
  return req.cookies.get(COOKIE_NAME)?.value;
}

/** The signed-in admin or moderator, or null. */
export async function getStaffSession(req?: NextRequest): Promise<StaffSession | null> {
  let token = tokenFromRequest(req);
  if (!token) {
    try {
      token = (await cookies()).get(COOKIE_NAME)?.value;
    } catch {
      // not in a request context
    }
  }
  return sessionFromToken(token);
}

/** True for admins only. Every admin-only API uses this. */
export async function isAuthenticatedAdmin(req?: NextRequest): Promise<boolean> {
  return (await getStaffSession(req))?.role === "admin";
}

/** Admin or moderator. For the routes moderators are allowed to use. */
export async function requireStaff(
  req: NextRequest
): Promise<{ ok: true; session: StaffSession } | { ok: false; response: NextResponse }> {
  const session = await getStaffSession(req);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true, session };
}

/** For server components (layout): validates the cookie, including the database check. */
export async function getStaffSessionFromCookies(): Promise<StaffSession | null> {
  try {
    return sessionFromToken((await cookies()).get(COOKIE_NAME)?.value);
  } catch {
    return null;
  }
}

export function setAdminCookie(res: NextResponse, token: string): void {
  res.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearAdminCookie(res: NextResponse): void {
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
