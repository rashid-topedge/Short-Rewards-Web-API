import { NextRequest, NextResponse } from "next/server";
import { createRedemptionRequest, isGoogleLinked, listUserRedemptions } from "@/lib/db";
import { authError, requireUser } from "@/lib/userAuth";
import { getUrlSigner } from "@/lib/b2";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const auth = await requireUser(req, searchParams.get("userId")?.trim());
    if (!auth.ok) return auth.response;

    const redemptions = await listUserRedemptions(auth.userId);
    const sign = await getUrlSigner("payouts", redemptions.map((r) => r.receiptUrl || ""), {
      scope: "file",
    });
    return NextResponse.json({
      items: redemptions.map((r) => ({ ...r, receiptUrl: r.receiptUrl ? sign(r.receiptUrl) : r.receiptUrl })),
    });
  } catch (err: unknown) {
    console.error("Failed to list redemptions:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await requireUser(req, body?.userId);
    if (!auth.ok) return auth.response;

    // Optional anti-fraud rule: only accounts with a linked Google account can cash out.
    if (process.env.REDEEM_REQUIRE_GOOGLE === "true" && !(await isGoogleLinked(auth.userId))) {
      return authError(403, "GOOGLE_LINK_REQUIRED", "Link your Google account before redeeming coins.");
    }

    const coinsAmount = Number(body?.coinsAmount);
    const paymentMethod = typeof body?.paymentMethod === "string" ? body.paymentMethod.trim() : null;
    const accountTitle = typeof body?.accountTitle === "string" ? body.accountTitle.trim() : null;
    const accountNumber = typeof body?.accountNumber === "string" ? body.accountNumber.trim() : null;
    const bankName = typeof body?.bankName === "string" ? body.bankName.trim() : undefined;

    if (!coinsAmount || !paymentMethod || !accountTitle || !accountNumber) {
      return NextResponse.json(
        { error: "coinsAmount, paymentMethod, accountTitle, and accountNumber are required" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(coinsAmount) || coinsAmount <= 0) {
      return NextResponse.json({ error: "coinsAmount must be a positive whole number" }, { status: 400 });
    }

    // ?lite=1: skip the 30-transaction history in the returned profile (load it from /api/user/transactions).
    const options = { includeTransactions: new URL(req.url).searchParams.get("lite") !== "1" };
    const result = await createRedemptionRequest(
      { userId: auth.userId, coinsAmount, paymentMethod, accountTitle, accountNumber, bankName },
      options
    );

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
