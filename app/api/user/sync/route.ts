import { NextRequest, NextResponse } from "next/server";
import { claimUser, getOrCreateUser, getUserProfileLite, takeRateLimit } from "@/lib/db";
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
 * - Add `?lite=1` (or `"lite": true` in the body) to skip `transactions` (faster
 *   for app start / pull-to-refresh; use GET /api/user/transactions for history).
 * - Without a token and without `requestToken` (old app builds): only works
 *   while USER_AUTH_ALLOW_LEGACY=true.
 */
function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip") || "").trim();
  return ip ? ip.slice(0, 64) : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const bodyUserId = typeof body?.userId === "string" ? body.userId.trim() : undefined;

    if (!getBearerToken(req) && body?.requestToken === true) {
      if (bodyUserId !== undefined && !isValidUserId(bodyUserId)) {
        return authError(400, "INVALID_USER_ID", "Invalid userId format");
      }
      // New accounts get a signup bonus, so limit how many one IP can create.
      // SIGNUP_LIMIT_PER_HOUR (default 30; 0 = off). Mobile networks share IPs, so keep it generous.
      const limit = Number(process.env.SIGNUP_LIMIT_PER_HOUR ?? "30");
      if (limit > 0) {
        const ip = clientIp(req);
        if (ip) {
          const rl = await takeRateLimit(`signup:${ip}`, limit, 3_600_000);
          if (!rl.allowed) {
            const res = authError(429, "TOO_MANY_ACCOUNTS", "Too many new accounts from this network. Try again later.");
            res.headers.set("Retry-After", String(rl.retryAfterSeconds));
            return res;
          }
        }
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

    const lite = new URL(req.url).searchParams.get("lite") === "1" || body?.lite === true;
    const user = lite ? await getUserProfileLite(auth.userId) : await getOrCreateUser(auth.userId);
    return NextResponse.json(user, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: unknown) {
    console.error("Failed to sync user profile:", err);
    return NextResponse.json({ error: "Internal server error syncing user" }, { status: 500 });
  }
}
