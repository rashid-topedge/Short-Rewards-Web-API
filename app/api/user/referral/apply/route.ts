import { NextRequest, NextResponse } from "next/server";
import { applyReferralCode, getOrCreateUser, getReferralSummary } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";

const STATUS: Record<string, number> = {
  REFERRALS_DISABLED: 403,
  INVALID_CODE: 404,
  SELF_REFERRAL: 400,
  CIRCULAR: 400,
  ALREADY_REFERRED: 409,
  TOO_LATE: 403,
};

/**
 * POST /api/user/referral/apply   { code }
 * A new user enters a friend's code (once, within the first N days).
 * 200 { status: "pending" | "rewarded", refereeCoins, referral, user }
 *   pending  → both get paid once the user meets referral.myReferral.requirements
 *   rewarded → already qualified; refereeCoins were added now
 * Errors: 404 INVALID_CODE, 409 ALREADY_REFERRED, 403 TOO_LATE / REFERRALS_DISABLED, 400 SELF_REFERRAL / CIRCULAR
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const result = await applyReferralCode(auth.userId, body?.code);
    if (!result.ok) {
      return NextResponse.json({ error: result.message, code: result.code }, { status: STATUS[result.code] ?? 400 });
    }
    const [referral, user] = await Promise.all([getReferralSummary(auth.userId), getOrCreateUser(auth.userId)]);
    return NextResponse.json({ ...result, referral, user });
  } catch (err) {
    console.error("Failed to apply referral code:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
