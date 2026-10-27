import { NextRequest, NextResponse } from "next/server";
import { revokeRefreshTokenFamily } from "@/lib/db";
import { hashRefreshToken } from "@/lib/userAuth";

/**
 * POST /api/user/logout   { "refreshToken": "rt_..." }
 * Ends this device's session. The current access token keeps working until it
 * expires (max 30 minutes), so the app should also delete it locally.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const refreshToken = typeof body?.refreshToken === "string" ? body.refreshToken.trim() : "";
    if (refreshToken) await revokeRefreshTokenFamily(hashRefreshToken(refreshToken));
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Failed to log out:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
