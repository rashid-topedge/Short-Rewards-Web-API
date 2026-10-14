import { NextResponse } from "next/server";
import { getSystemSettings } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSystemSettings();
  return NextResponse.json({
    coinToPkrRate: settings.coinToPkrRate,
    minRedeemCoins: settings.minRedeemCoins,
    minRedeemPkr: Math.round(settings.minRedeemCoins * settings.coinToPkrRate * 100) / 100,
    supportedPaymentMethods: ["Easypaisa", "JazzCash", "Bank Transfer", "Raast"],
  });
}
