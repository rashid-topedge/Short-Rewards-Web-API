import { NextRequest, NextResponse } from "next/server";
import { claimUser, getOrCreateUser } from "@/lib/db";
import {
  authError,
  generateUserId,
  getBearerToken,
  isValidUserId,
  issueSession,
  requireUser,
} from "@/lib/userAuth";

/**
 * POST /api/user/sync
 *
 * - With `Authorization: Bearer <accessToken>`: returns the user's profile.
 * - Without a token and with `{ "requestToken": true }`: starts an anonymous
 *   account and returns a session (accessToken + refreshToken). Send the
 *   `userId` the app already has to keep that account (works once per account),
 *   or omit it to create a new one. To get back into an account on a new device,
 *   use POST /api/user/login-google instead.
 * - Without a token and without `requestToken` (old app builds): only works
 *   while USER_AUTH_ALLOW_LEGACY=true.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const bodyUserId = typeof body?.userId === "string" ? body.userId.trim() : undefined;

    if (!getBearerToken(req) && body?.requestToken === true) {
      if (bodyUserId !== undefined && !isValidUserId(bodyUserId)) {
        return authError(400, "INVALID_USER_ID", "Invalid userId format");
      }
      const userId = bodyUserId || generateUserId();

      const claimed = await claimUser(userId);
      if (!claimed) {
        return authError(
          409,
          "ACCOUNT_ALREADY_CLAIMED",
          "This account is already signed in on another device. Sign in with Google to recover it."
        );
      }

      const [user, session] = await Promise.all([getOrCreateUser(userId), issueSession(userId)]);
      // `token` is kept as an alias of accessToken for clients built against the first version.
      return NextResponse.json({ ...user, ...session, token: session.accessToken });
    }

    const auth = await requireUser(req, bodyUserId);
    if (!auth.ok) return auth.response;

    const user = await getOrCreateUser(auth.userId);
    return NextResponse.json(user);
  } catch (err: unknown) {
    console.error("Failed to sync user profile:", err);
    return NextResponse.json({ error: "Internal server error syncing user" }, { status: 500 });
  }
}
