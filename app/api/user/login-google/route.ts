import { NextRequest, NextResponse } from "next/server";
import { findOrCreateUserForGoogle, getOrCreateUser } from "@/lib/db";
import { GoogleTokenError, isGoogleSignInConfigured, verifyGoogleIdToken } from "@/lib/googleAuth";
import { authError, generateUserId, issueSession } from "@/lib/userAuth";

/**
 * POST /api/user/login-google   { "idToken": "<Google ID token>" }
 *
 * Signs in with Google: returns a new session for the app account linked to
 * that Google account. If no account is linked yet, creates a new one linked
 * to it (`created: true`). Use this on reinstall / new phone, or to switch
 * accounts after link-google returned GOOGLE_ACCOUNT_IN_USE.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isGoogleSignInConfigured()) {
      return authError(503, "GOOGLE_NOT_CONFIGURED", "Google sign-in is not configured on the server");
    }

    const body = await req.json().catch(() => ({}));
    const idToken = typeof body?.idToken === "string" ? body.idToken.trim() : "";
    if (!idToken) return authError(400, "ID_TOKEN_REQUIRED", "idToken is required");

    let google;
    try {
      google = await verifyGoogleIdToken(idToken);
    } catch (err) {
      if (err instanceof GoogleTokenError) return authError(401, "GOOGLE_TOKEN_INVALID", err.message);
      throw err;
    }

    const { userId, created } = await findOrCreateUserForGoogle(google.sub, google.email, generateUserId());
    const [user, session] = await Promise.all([getOrCreateUser(userId), issueSession(userId)]);
    return NextResponse.json({ ...user, ...session, created });
  } catch (err: unknown) {
    console.error("Failed to sign in with Google:", err);
    return NextResponse.json({ error: "Internal server error signing in" }, { status: 500 });
  }
}
