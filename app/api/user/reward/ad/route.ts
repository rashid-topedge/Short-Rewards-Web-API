import { NextRequest, NextResponse } from "next/server";
import { rewardAd } from "@/lib/db";
import { claimResponse, readClaimId } from "@/lib/claimHttp";
import { requireUser } from "@/lib/userAuth";

/**
 * POST /api/user/reward/ad[?lite=1]   { adType?, claimId? }
 * Header: Authorization: Bearer <accessToken>
 * Send one claim ID per ad view (Idempotency-Key header or body.claimId) and
 * reuse it on retries: that ad view can then never pay twice, from any device.
 * With REQUIRE_AD_CLAIM_ID=true the claim ID is mandatory.
 * 200 granted (or `replayed: true`), 429 DAILY_LIMIT / COOLDOWN, 422 CLAIM_ID_REUSED,
 * 400 for a malformed JSON body.
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // An empty body is fine; a malformed one is rejected clearly.
    let body: Record<string, unknown> = {};
    const rawBody = await req.text();
    if (rawBody.trim()) {
      try {
        const parsed = JSON.parse(rawBody);
        if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid JSON request body", code: "INVALID_JSON" },
          { status: 400 }
        );
      }
    }

    // The user comes from the access token. A body/query userId is only
    // accepted for old app builds while USER_AUTH_ALLOW_LEGACY=true.
    const legacyUserId =
      (typeof body.userId === "string" ? body.userId.trim() : "") || searchParams.get("userId")?.trim();
    const auth = await requireUser(req, legacyUserId);
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

    const adType =
      typeof body.adType === "string" && body.adType.trim() ? body.adType.trim().slice(0, 64) : "REWARDED_VIDEO";
    const includeTransactions = searchParams.get("lite") !== "1";

    // The reward day is decided by the server (APP_TIMEZONE); clientDate is ignored.
    const result = await rewardAd(auth.userId, adType, { includeTransactions, claimId });
    return claimResponse(result);
  } catch (err: unknown) {
    console.error("Failed to process ad reward:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error processing ad reward" },
      { status: 500 }
    );
  }
}
