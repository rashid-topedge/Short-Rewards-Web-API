import { NextRequest, NextResponse } from "next/server";
import { rewardAd } from "@/lib/db";
import { claimResponse, readClaimId } from "@/lib/claimHttp";
import { requireUser } from "@/lib/userAuth";

/**
 * POST /api/user/reward/ad[?lite=1]   { adType?, claimId? }
 * Send one claim ID per ad view (Idempotency-Key header or body.claimId) and
 * reuse it on retries: that ad view can then never pay twice, from any device.
 * With REQUIRE_AD_CLAIM_ID=true the claim ID is mandatory.
 * 200 granted (or `replayed: true`), 429 DAILY_LIMIT / COOLDOWN, 422 CLAIM_ID_REUSED.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await requireUser(req, body?.userId);
    if (!auth.ok) return auth.response;

    const claim = readClaimId(req, body);
    if (!claim.ok) return claim.response;
    const { claimId } = claim;
    if (!claimId && process.env.REQUIRE_AD_CLAIM_ID === "true") {
      return NextResponse.json(
        { error: "Send a unique claim ID for each ad view (Idempotency-Key header or claimId)", code: "CLAIM_ID_REQUIRED" },
        { status: 400 }
      );
    }

    const adType = typeof body?.adType === "string" ? body.adType.trim().slice(0, 64) : "REWARDED_VIDEO";
    const includeTransactions = new URL(req.url).searchParams.get("lite") !== "1";

    const result = await rewardAd(auth.userId, adType || "REWARDED_VIDEO", { includeTransactions, claimId });
    return claimResponse(result);
  } catch (err: unknown) {
    console.error("Failed to process ad reward:", err);
    return NextResponse.json({ error: "Internal server error processing ad reward" }, { status: 500 });
  }
}
