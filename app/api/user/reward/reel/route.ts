import { NextRequest, NextResponse } from "next/server";
import { awardReelWatched } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = typeof body?.userId === "string" ? body.userId.trim() : null;
    const reelId = Number(body?.reelId);
    const clientDate = typeof body?.clientDate === "string" ? body.clientDate.trim() : undefined;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!Number.isInteger(reelId) || reelId <= 0) {
      return NextResponse.json({ error: "reelId is required" }, { status: 400 });
    }

    const result = awardReelWatched(userId, reelId, clientDate);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Failed to process reel reward:", err);
    return NextResponse.json(
      { error: "Internal server error processing reel reward" },
      { status: 500 }
    );
  }
}
