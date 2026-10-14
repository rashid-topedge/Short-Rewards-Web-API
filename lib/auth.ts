import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "dramflix_admin_secret_key_987654321";
export const COOKIE_NAME = "dramflix_admin_session";

export function checkAdminCredentials(user: string, pass: string): boolean {
  return (
    user.trim() === ADMIN_USERNAME.trim() &&
    pass.trim() === ADMIN_PASSWORD.trim()
  );
}

export function generateSessionToken(): string {
  const timestamp = Date.now().toString();
  const random = crypto.randomBytes(16).toString("hex");
  const payload = `${timestamp}:${random}`;
  const signature = crypto
    .createHmac("sha256", ADMIN_SECRET)
    .update(payload)
    .digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

export function validateSessionToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [encodedPayload, signature] = parts;
  try {
    const payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const [timestampStr] = payload.split(":");
    const timestamp = Number(timestampStr);

    // Expire session after 7 days (7 * 24 * 60 * 60 * 1000)
    if (isNaN(timestamp) || Date.now() - timestamp > 604800000) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac("sha256", ADMIN_SECRET)
      .update(payload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch {
    return false;
  }
}

export async function isAuthenticatedAdmin(req?: NextRequest): Promise<boolean> {
  let token: string | undefined;
  if (req) {
    // 1. Check Bearer token in Authorization header
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }

    // 2. Check req.cookies
    if (!token) {
      token = req.cookies.get(COOKIE_NAME)?.value;
    }

    // 3. Check Cookie header fallback
    if (!token) {
      const cookieHeader = req.headers.get("cookie");
      if (cookieHeader) {
        const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
        if (match) token = match[1];
      }
    }
  }

  // 4. Check cookies() store fallback
  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(COOKIE_NAME)?.value;
    } catch {
      // Running in context where cookies() is not available
    }
  }
  return validateSessionToken(token);
}

export function setAdminCookie(res: NextResponse, token: string): void {
  res.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
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
