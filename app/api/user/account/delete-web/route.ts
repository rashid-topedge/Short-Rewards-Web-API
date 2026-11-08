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

/**
 * POST /api/user/account/delete-web   { "idToken": "<Google ID token>", "action": "status" | "request" | "cancel" }
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
    const idToken = typeof body?.idToken === "string" ? body.idToken.trim() : "";
    const action = body?.action;
    if (!idToken) return authError(400, "ID_TOKEN_REQUIRED", "idToken is required");
    if (action !== "status" && action !== "request" && action !== "cancel") {
      return authError(400, "INVALID_ACTION", 'action must be "status", "request" or "cancel"');
    }

    const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "").trim();
    if (ip) {
      const rl = await takeRateLimit(`delete-web:${ip.slice(0, 64)}`, 30, 3_600_000);
      if (!rl.allowed) return authError(429, "TOO_MANY_REQUESTS", "Too many attempts. Try again later.");
    }

    let google;
    try {
      google = await verifyGoogleIdToken(idToken);
    } catch (err) {
      if (err instanceof GoogleTokenError) return authError(401, "GOOGLE_TOKEN_INVALID", "Google sign-in failed. Please try again.");
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
