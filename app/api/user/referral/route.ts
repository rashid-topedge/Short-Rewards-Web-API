import { NextRequest, NextResponse } from "next/server";
import { getReferralSummary } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";

/**
 * GET /api/user/referral
 * My referral code + share link, what each side earns, how many people used
 * my code, and the status of my own referral (with what's left to qualify).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    return NextResponse.json(await getReferralSummary(auth.userId));
  } catch (err) {
    console.error("Failed to load referral info:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
