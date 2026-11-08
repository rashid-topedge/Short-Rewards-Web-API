import { NextRequest, NextResponse } from "next/server";
import { checkReferralQualification, getOrCreateUser, logActivity, resolveFirebaseUser } from "@/lib/db";
import { FirebaseTokenError, verifyFirebaseIdToken } from "@/lib/firebaseAuth";
import { authError, isValidUserId, issueSession } from "@/lib/userAuth";

/**
 * POST /api/user/firebase-session
 * { "firebaseIdToken": "<Firebase ID token>", "userId": "<Firebase UID>", "legacyUserId"?: "<pre-auth id>" }
 *
 * The Android app's sign-in: "Continue as guest" (Firebase anonymous user) and
 * "Sign in with Google" (Firebase Google user) both end here, and the app calls
 * it again after linking Google so googleLinked / googleEmail are recorded.
 *
 * The UID is taken from the *verified* token; the body's userId must match it.
 * A bare userId is never trusted, otherwise anyone who learned someone's id
 * could take over that account and its coins.
 *
 * Returns the profile plus a new app session (accessToken + refreshToken), the
 * same shape as /api/user/login-google, with `created: true` for new accounts.
 *
 * 401 FIREBASE_TOKEN_INVALID   bad / expired token, or userId ≠ token uid
 * 409 ACCOUNT_ALREADY_CLAIMED  legacyUserId already belongs to a signed-in account
 * 409 GOOGLE_ACCOUNT_IN_USE    (no longer returned: signing in with a Google account that
 *                              already has an app account opens that account; a guest
 *                              account the phone was using is left as it is)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const idToken = typeof body?.firebaseIdToken === "string" ? body.firebaseIdToken.trim() : "";
    if (!idToken) return authError(400, "FIREBASE_TOKEN_REQUIRED", "firebaseIdToken is required");

    let identity;
    try {
      identity = await verifyFirebaseIdToken(idToken);
    } catch (err) {
      if (err instanceof FirebaseTokenError) {
        return authError(401, "FIREBASE_TOKEN_INVALID", "Your sign-in has expired. Please sign in again.");
      }
      throw err;
    }

    const bodyUserId = typeof body?.userId === "string" ? body.userId.trim() : "";
    if (bodyUserId && bodyUserId !== identity.uid) {
      return authError(401, "FIREBASE_TOKEN_INVALID", "Account mismatch. Please sign in again.");
    }
    if (!isValidUserId(identity.uid)) {
      return authError(400, "INVALID_USER_ID", "Unsupported Firebase user id");
    }

    const legacyUserId =
      typeof body?.legacyUserId === "string" && isValidUserId(body.legacyUserId.trim())
        ? body.legacyUserId.trim()
        : null;

    const result = await resolveFirebaseUser({
      uid: identity.uid,
      googleSub: identity.googleSub,
      // Only store an email Google has verified.
      googleEmail: identity.emailVerified ? identity.email : null,
      legacyUserId,
    });

    if (result.status === "legacy_claimed") {
      return authError(
        409,
        "ACCOUNT_ALREADY_CLAIMED",
        "This account is already signed in on another device. Sign in with Google to recover it."
      );
    }
    if (result.status === "google_in_use") {
      return authError(
        409,
        "GOOGLE_ACCOUNT_IN_USE",
        "This Google account is already linked to another account. Sign in with Google to switch to it."
      );
    }

    // The Google account's own app account was re-attached to this Firebase user: record it.
    if (result.recovered) {
      const r = result.recovered;
      await logActivity(
        { actorId: "system", displayName: "Sign-in", role: "system" },
        {
          action: "user.signin_recovered",
          entityType: "user",
          entityId: result.userId,
          summary: r.detachedUserId
            ? `Signed in with Google: switched from account ${r.detachedUserId} to the Google account's own account`
            : "Signed in with Google: account re-attached to a new Firebase user",
          details: { previousFirebaseUid: r.previousFirebaseUid, firebaseUid: identity.uid, detachedUserId: r.detachedUserId },
        }
      ).catch((err) => console.error("Activity log failed:", err));
    }

    // Linking Google may complete a pending referral.
    await checkReferralQualification(result.userId).catch((err) => console.error("Referral check failed:", err));
    const [user, session] = await Promise.all([getOrCreateUser(result.userId), issueSession(result.userId)]);
    return NextResponse.json({ ...user, ...session, created: result.created });
  } catch (err: unknown) {
    console.error("Failed to start Firebase session:", err);
    return NextResponse.json({ error: "Internal server error signing in" }, { status: 500 });
  }
}
