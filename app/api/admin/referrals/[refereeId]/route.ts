import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { logActivity, reviewReferralAdmin } from "@/lib/db";
import { actorOf } from "@/lib/reelPermissions";

/**
 * POST /api/admin/referrals/:refereeId  { action: "reject" | "pay", note? }
 * Pending referrals only. "pay" pays both sides now, even if the rules aren't met.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ refereeId: string }> }) {
  const session = await getStaffSession(req);
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const refereeId = decodeURIComponent((await ctx.params).refereeId);
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (action !== "reject" && action !== "pay") {
    return NextResponse.json({ error: "action must be reject or pay" }, { status: 400 });
  }

  const result = await reviewReferralAdmin(refereeId, action, note);
  if (!result.ok) return NextResponse.json({ error: "This referral isn't pending any more." }, { status: 409 });

  await logActivity(actorOf(session), {
    action: action === "pay" ? "referral.paid" : "referral.rejected",
    entityType: "referral",
    entityId: refereeId,
    summary: `${action === "pay" ? "Paid" : "Rejected"} referral of user ${refereeId}${note ? ` — ${note}` : ""}`,
  });
  return NextResponse.json({ success: true });
}
