import { NextRequest, NextResponse } from "next/server";
import { getStaffSession, isAdminOrLead } from "@/lib/auth";
import { logActivity, processRedemptionAdmin } from "@/lib/db";
import { actorOf } from "@/lib/reelPermissions";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Admin and lead moderators confirm or reject payouts; every decision is in the Activity log.
  const session = await getStaffSession(req);
  if (!isAdminOrLead(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const redemptionId = parseInt(id, 10);
    if (isNaN(redemptionId)) {
      return NextResponse.json({ error: "Invalid redemption ID" }, { status: 400 });
    }

    const body = await req.json();
    const action = body?.action as "PAID" | "REJECTED";
    if (action !== "PAID" && action !== "REJECTED") {
      return NextResponse.json({ error: "Action must be PAID or REJECTED" }, { status: 400 });
    }

    // The app opens the receipt as an image link, so it has to be a web address.
    if (action === "PAID" && typeof body?.receiptUrl === "string" && body.receiptUrl.trim() && !/^https?:\/\/\S+$/i.test(body.receiptUrl.trim())) {
      return NextResponse.json(
        { success: false, message: "The receipt must be an uploaded image or an https:// link." },
        { status: 400 }
      );
    }

    const result = await processRedemptionAdmin(redemptionId, {
      action,
      transactionRef: body?.transactionRef,
      receiptUrl: body?.receiptUrl,
      adminNotes: body?.adminNotes,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    const r = result.redemption;
    await logActivity(actorOf(session), {
      action: action === "PAID" ? "payout.paid" : "payout.rejected",
      entityType: "payout",
      entityId: redemptionId,
      summary:
        action === "PAID"
          ? `Paid payout #${redemptionId}${r ? ` (Rs. ${r.pkrAmount} via ${r.paymentMethod})` : ""}, ref ${String(body?.transactionRef ?? "").trim()}`
          : `Rejected payout #${redemptionId}${body?.adminNotes ? `: ${String(body.adminNotes).trim()}` : ""} (coins refunded)`,
    }).catch((err) => console.error("Activity log failed:", err));

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Failed to process redemption:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
