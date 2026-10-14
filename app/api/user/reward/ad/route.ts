import { NextRequest, NextResponse } from "next/server";
import { rewardAd } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = typeof body?.userId === "string" ? body.userId.trim() : null;
    const adType = typeof body?.adType === "string" ? body.adType.trim() : "REWARDED_VIDEO";
    const clientDate = typeof body?.clientDate === "string" ? body.clientDate.trim() : undefined;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const result = rewardAd(userId, adType, clientDate);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Failed to process ad reward:", err);
    return NextResponse.json(
      { error: "Internal server error processing ad reward" },
      { status: 500 }
    );
  }
}
