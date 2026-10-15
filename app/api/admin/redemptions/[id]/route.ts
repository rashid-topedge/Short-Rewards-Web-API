import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { processRedemptionAdmin } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticatedAdmin(req))) {
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

    const result = await processRedemptionAdmin(redemptionId, {
      action,
      transactionRef: body?.transactionRef,
      receiptUrl: body?.receiptUrl,
      adminNotes: body?.adminNotes,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Failed to process redemption:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
