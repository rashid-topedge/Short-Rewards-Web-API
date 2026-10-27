import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser, linkGoogleAccount } from "@/lib/db";
import { GoogleTokenError, isGoogleSignInConfigured, verifyGoogleIdToken } from "@/lib/googleAuth";
import { authError, requireUser } from "@/lib/userAuth";

/**
 * POST /api/user/link-google   { "idToken": "<Google ID token>" }
 * Header: Authorization: Bearer <accessToken>
 *
 * Links the signed-in (usually anonymous) account to a Google account, so the
 * user can recover it on another device with /api/user/login-google.
 *
 * 409 GOOGLE_ACCOUNT_IN_USE: that Google account already belongs to another app
 *     account. The app can offer to switch to it via /api/user/login-google
 *     (coins are not merged between accounts).
 * 409 ACCOUNT_ALREADY_LINKED: this app account is linked to a different Google account.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isGoogleSignInConfigured()) {
      return authError(503, "GOOGLE_NOT_CONFIGURED", "Google sign-in is not configured on the server");
    }

    // A real session token is required: linking via a bare userId would let anyone
    // attach their Google account to someone else's coins.
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    if (!auth.viaToken) return authError(401, "AUTH_REQUIRED", "Sign in before linking a Google account");

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

    const result = await linkGoogleAccount(auth.userId, google.sub, google.email);
    if (result.status === "google_in_use") {
      return authError(
        409,
        "GOOGLE_ACCOUNT_IN_USE",
        "This Google account is already linked to another account. Sign in with Google to switch to it."
      );
    }
    if (result.status === "account_has_other_google") {
      return authError(409, "ACCOUNT_ALREADY_LINKED", "This account is already linked to a different Google account.");
    }

    const user = await getOrCreateUser(auth.userId);
    return NextResponse.json({ ...user, linked: true });
  } catch (err: unknown) {
    console.error("Failed to link Google account:", err);
    return NextResponse.json({ error: "Internal server error linking Google account" }, { status: 500 });
  }
}
