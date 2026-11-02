import { NextRequest, NextResponse } from "next/server";
import { getStaffSession, isAdminOrLead } from "@/lib/auth";
import { getSystemSettings, listRedemptionsAdmin } from "@/lib/db";
import { getUrlSigner } from "@/lib/b2";

/** GET /api/admin/redemptions: payout requests (admin and lead moderators). */
export async function GET(req: NextRequest) {
  if (!isAdminOrLead(await getStaffSession(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";
  const userId = searchParams.get("userId") || undefined;
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const data = await listRedemptionsAdmin({
    status,
    userId,
    limit,
    offset,
    cursor: searchParams.get("cursor"),
  });

  // Receipts may live in a private bucket; give the admin page playable links.
  const [sign, settings] = await Promise.all([
    getUrlSigner("payouts", data.items.map((r) => r.receiptUrl || "")),
    getSystemSettings(),
  ]);
  return NextResponse.json({
    ...data,
    // The two numbers the payouts page shows (the rest of Settings, with the storage keys, stays admin-only).
    rates: { coinToPkrRate: settings.coinToPkrRate, minRedeemCoins: settings.minRedeemCoins },
    items: data.items.map((r) => ({ ...r, receiptUrl: r.receiptUrl ? sign(r.receiptUrl) : r.receiptUrl })),
  });
}
