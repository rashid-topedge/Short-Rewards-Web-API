import { NextRequest, NextResponse } from "next/server";
import { getRewardConfig, getReelRewardInfo } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { createWatchToken } from "@/lib/watchToken";

/**
 * POST /api/user/reward/reel/start   { reelId }
 * Call when a reel starts playing. Returns a `watchToken` to send with the
 * claim (POST /api/user/reward/reel) and what the reel pays:
 * { watchToken, coins, durationSeconds, minWatchSeconds, alreadyClaimed }
 * The claim pays once `minWatchSeconds` have passed since this call.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await requireUser(req, body?.userId);
    if (!auth.ok) return auth.response;

    const reelId = Number(body?.reelId);
    if (!Number.isInteger(reelId) || reelId <= 0) {
      return NextResponse.json({ error: "reelId is required" }, { status: 400 });
    }
    const info = await getReelRewardInfo(auth.userId, reelId);
    if (!info) return NextResponse.json({ error: "This reel isn't available.", code: "REEL_NOT_FOUND" }, { status: 404 });

    const { reel } = await getRewardConfig();
    return NextResponse.json({
      watchToken: reel.watchTokenMode === "off" ? null : createWatchToken(auth.userId, reelId),
      ...info,
    });
  } catch (err) {
    console.error("Failed to start reel watch session:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
