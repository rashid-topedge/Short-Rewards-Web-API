import { NextRequest, NextResponse } from "next/server";
import { rotateRefreshToken } from "@/lib/db";
import {
  REFRESH_TOKEN_TTL_DAYS,
  authError,
  hashRefreshToken,
  newRefreshTokenValue,
  sessionFor,
} from "@/lib/userAuth";

/**
 * POST /api/user/refresh   { "refreshToken": "rt_..." }
 * Returns a new accessToken + refreshToken. The old refresh token stops working.
 * Call this when any request fails with code TOKEN_EXPIRED, then retry it.
 * Only run one refresh at a time per device.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const refreshToken = typeof body?.refreshToken === "string" ? body.refreshToken.trim() : "";
    if (!refreshToken) return authError(400, "REFRESH_TOKEN_REQUIRED", "refreshToken is required");

    const next = newRefreshTokenValue();
    const result = await rotateRefreshToken(
      hashRefreshToken(refreshToken),
      hashRefreshToken(next),
      REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        invalid: "Unknown refresh token; sign in again",
        expired: "Session expired; sign in again",
        revoked: "Session was signed out; sign in again",
        reused: "Refresh token was already used; sign in again",
      };
      return authError(401, `REFRESH_${result.reason.toUpperCase()}`, messages[result.reason]);
    }

    return NextResponse.json(sessionFor(result.userId, next));
  } catch (err: unknown) {
    console.error("Failed to refresh session:", err);
    return NextResponse.json({ error: "Internal server error refreshing session" }, { status: 500 });
  }
}
