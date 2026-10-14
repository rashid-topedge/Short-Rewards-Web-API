import { NextRequest, NextResponse } from "next/server";
import { awardEpisodeWatched } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = typeof body?.userId === "string" ? body.userId.trim() : null;
    const dramaId = Number(body?.dramaId);
    const ep = Number(body?.ep);
    const clientDate = typeof body?.clientDate === "string" ? body.clientDate.trim() : undefined;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!Number.isInteger(dramaId) || dramaId <= 0 || !Number.isInteger(ep) || ep <= 0) {
      return NextResponse.json({ error: "dramaId and ep are required" }, { status: 400 });
    }

    const result = awardEpisodeWatched(userId, dramaId, ep, clientDate);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Failed to process episode reward:", err);
    return NextResponse.json(
      { error: "Internal server error processing episode reward" },
      { status: 500 }
    );
  }
}
