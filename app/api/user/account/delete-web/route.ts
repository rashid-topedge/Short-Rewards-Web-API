import { NextRequest, NextResponse } from "next/server";
import {
  cancelAccountDeletion,
  findUserIdByGoogleSub,
  getDeletionStatus,
  requestAccountDeletion,
  takeRateLimit,
} from "@/lib/db";
import { GoogleTokenError, isGoogleSignInConfigured, verifyGoogleIdToken } from "@/lib/googleAuth";
import { authError } from "@/lib/userAuth";
import { DELETE_PAGE_COOKIE, DELETE_PAGE_COOKIE_PATH } from "@/lib/deletePageCookie";

/**
 * POST /api/user/account/delete-web   { "idToken"?: "<Google ID token>", "action": "status" | "request" | "cancel" | "signout" }
 *
 * The token comes from `idToken`, or from the cookie set by the page's Google
 * sign-in (redirect mode, see ./google/route.ts). 401 NOT_SIGNED_IN without one.
 *
 * Used by the public /delete-account page (Google Play's "delete your account"
 * link): the person proves who they are with Google sign-in. Only accounts that
 * linked Google can be found this way; guest-only accounts delete from the app.
 * Never creates an account.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isGoogleSignInConfigured()) {
      return authError(503, "GOOGLE_NOT_CONFIGURED", "Google sign-in is not configured on the server");
    }
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    if (action === "signout") {
      const res = NextResponse.json({ success: true });
      res.cookies.set({ name: DELETE_PAGE_COOKIE, value: "", path: DELETE_PAGE_COOKIE_PATH, maxAge: 0 });
      return res;
    }
    const idToken =
      (typeof body?.idToken === "string" ? body.idToken.trim() : "") || req.cookies.get(DELETE_PAGE_COOKIE)?.value || "";
    if (action !== "status" && action !== "request" && action !== "cancel") {
      return authError(400, "INVALID_ACTION", 'action must be "status", "request", "cancel" or "signout"');
    }
    if (!idToken) return authError(401, "NOT_SIGNED_IN", "Sign in with Google to continue.");

    const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "").trim();
    if (ip) {
      const rl = await takeRateLimit(`delete-web:${ip.slice(0, 64)}`, 30, 3_600_000);
      if (!rl.allowed) return authError(429, "TOO_MANY_REQUESTS", "Too many attempts. Try again later.");
    }

    let google;
    try {
      google = await verifyGoogleIdToken(idToken);
    } catch (err) {
      if (err instanceof GoogleTokenError) {
        const res = authError(401, "GOOGLE_TOKEN_INVALID", "Your sign-in has expired. Please sign in with Google again.");
        res.cookies.set({ name: DELETE_PAGE_COOKIE, value: "", path: DELETE_PAGE_COOKIE_PATH, maxAge: 0 });
        return res;
      }
      throw err;
    }

    const userId = await findUserIdByGoogleSub(google.sub);
    if (!userId) {
      return authError(
        404,
        "NO_ACCOUNT",
        "No account is linked to this Google account. If you use the app as a guest, delete your account from the app's settings."
      );
    }

    if (action === "request") {
      const result = await requestAccountDeletion(userId);
      if (!result.ok) {
        if (result.reason === "payout_pending") {
          return authError(
            409,
            "PAYOUT_PENDING",
            "You have a payout that hasn't been processed yet. You can delete your account once it's paid or rejected."
          );
        }
        return authError(404, "NO_ACCOUNT", "Account not found");
      }
      return NextResponse.json({ email: google.email ?? null, ...result.status });
    }
    if (action === "cancel") await cancelAccountDeletion(userId);
    const status = await getDeletionStatus(userId);
    return NextResponse.json({ email: google.email ?? null, ...(status ?? { deletionRequestedAt: null, deletionDueAt: null }) });
  } catch (err) {
    console.error("Account deletion (web) failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
