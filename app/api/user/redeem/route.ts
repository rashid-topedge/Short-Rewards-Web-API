import { NextRequest, NextResponse } from "next/server";
import { createRedemptionRequest, listUserRedemptions } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId")?.trim();

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const redemptions = listUserRedemptions(userId);
  return NextResponse.json({ items: redemptions });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = typeof body?.userId === "string" ? body.userId.trim() : null;
    const coinsAmount = Number(body?.coinsAmount);
    const paymentMethod = typeof body?.paymentMethod === "string" ? body.paymentMethod.trim() : null;
    const accountTitle = typeof body?.accountTitle === "string" ? body.accountTitle.trim() : null;
    const accountNumber = typeof body?.accountNumber === "string" ? body.accountNumber.trim() : null;
    const bankName = typeof body?.bankName === "string" ? body.bankName.trim() : undefined;

    if (!userId || !coinsAmount || !paymentMethod || !accountTitle || !accountNumber) {
      return NextResponse.json(
        { error: "userId, coinsAmount, paymentMethod, accountTitle, and accountNumber are required" },
        { status: 400 }
      );
    }

    if (coinsAmount <= 0) {
      return NextResponse.json({ error: "coinsAmount must be a positive number" }, { status: 400 });
    }

    const result = createRedemptionRequest({
      userId,
      coinsAmount,
      paymentMethod,
      accountTitle,
      accountNumber,
      bankName,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Failed to process redemption request:", err);
    return NextResponse.json(
      { error: "Internal server error processing redemption request" },
      { status: 500 }
    );
  }
}
