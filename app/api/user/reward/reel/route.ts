import { NextRequest, NextResponse } from "next/server";
import { awardReelWatched } from "@/lib/db";
import { claimResponse, readClaimId } from "@/lib/claimHttp";
import { requireUser } from "@/lib/userAuth";

/**
 * POST /api/user/reward/reel[?lite=1]   { reelId, claimId? }
 * Each reel pays once per user, from any device.
 * 200 granted (or `replayed: true`), 409 ALREADY_CLAIMED, 429 DAILY_LIMIT.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await requireUser(req, body?.userId);
    if (!auth.ok) return auth.response;

    const claim = readClaimId(req, body);
    if (!claim.ok) return claim.response;
    const { claimId } = claim;

    const reelId = Number(body?.reelId);
    if (!Number.isInteger(reelId) || reelId <= 0) {
      return NextResponse.json({ error: "reelId is required" }, { status: 400 });
    }

    const includeTransactions = new URL(req.url).searchParams.get("lite") !== "1";
    const result = await awardReelWatched(auth.userId, reelId, { includeTransactions, claimId });
    return claimResponse(result);
  } catch (err: unknown) {
    console.error("Failed to process reel reward:", err);
    return NextResponse.json({ error: "Internal server error processing reel reward" }, { status: 500 });
  }
}
