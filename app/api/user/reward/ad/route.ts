import { NextRequest, NextResponse } from "next/server";
import { awardRewardedAd } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    let body: Record<string, unknown> = {};
    const rawBody = await req.text();

    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json(
          { success: false, message: "Invalid JSON request body" },
          { status: 400 }
        );
      }
    }

    const bodyUserId =
      typeof body.userId === "string" ? body.userId.trim() : "";

    const userId = bodyUserId || searchParams.get("userId")?.trim();

    const adType =
      typeof body.adType === "string" && body.adType.trim()
        ? body.adType.trim()
        : "REWARDED_VIDEO";

    const clientDate =
      typeof body.clientDate === "string"
        ? body.clientDate.trim()
        : undefined;

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "userId is required" },
        { status: 400 }
      );
    }

    const result = await awardRewardedAd(userId, adType, clientDate);

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Failed to process ad reward:", err);

    return NextResponse.json(
      {
        success: false,
        message:
          err instanceof Error
            ? err.message
            : "Internal server error processing ad reward",
      },
      { status: 500 }
    );
  }
}