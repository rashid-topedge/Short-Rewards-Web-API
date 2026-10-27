import { NextRequest, NextResponse } from "next/server";
import { awardEpisodeWatched } from "@/lib/db";
import { claimResponse, readClaimId } from "@/lib/claimHttp";
import { requireUser } from "@/lib/userAuth";

/**
 * POST /api/user/reward/episode[?lite=1]   { dramaId, ep, claimId? }
 * Each episode pays once per user, from any device.
 * 200 granted (or `replayed: true`), 409 ALREADY_CLAIMED.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await requireUser(req, body?.userId);
    if (!auth.ok) return auth.response;

    const claim = readClaimId(req, body);
    if (!claim.ok) return claim.response;
    const { claimId } = claim;

    const dramaId = Number(body?.dramaId);
    const ep = Number(body?.ep);
    if (!Number.isInteger(dramaId) || dramaId <= 0 || !Number.isInteger(ep) || ep <= 0) {
      return NextResponse.json({ error: "dramaId and ep are required" }, { status: 400 });
    }

    const includeTransactions = new URL(req.url).searchParams.get("lite") !== "1";
    const result = await awardEpisodeWatched(auth.userId, dramaId, ep, { includeTransactions, claimId });
    return claimResponse(result);
  } catch (err: unknown) {
    console.error("Failed to process episode reward:", err);
    return NextResponse.json({ error: "Internal server error processing episode reward" }, { status: 500 });
  }
}
