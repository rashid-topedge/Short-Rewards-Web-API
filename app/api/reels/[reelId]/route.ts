import { NextRequest, NextResponse, after } from "next/server";
import { getReel, incrementReelLikes } from "@/lib/db";
import { flushReelViews, recordReelView, reelViewsFlushDue } from "@/lib/viewCounter";
import { getUrlSigner } from "@/lib/b2";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reelId: string }> }
) {
  const { reelId } = await params;
  const id = parseInt(reelId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid reel ID" }, { status: 400 });
  }

  try {
    const reel = await getReel(id);
    if (!reel) {
      return NextResponse.json({ error: "Reel not found" }, { status: 404 });
    }

    const sign = await getUrlSigner("reels", [reel.videoUrl, reel.thumbnailUrl || ""]);

    // Views are counted in memory and written in batches (see lib/viewCounter.ts).
    recordReelView(id);
    if (reelViewsFlushDue()) after(() => flushReelViews());

    return NextResponse.json({
      ...reel,
      videoUrl: sign(reel.videoUrl),
      thumbnailUrl: reel.thumbnailUrl ? sign(reel.thumbnailUrl) : reel.thumbnailUrl,
    });
  } catch (err) {
    console.error("Failed to load reel:", err);
    return NextResponse.json({ error: "Failed to load reel" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reelId: string }> }
) {
  const { reelId } = await params;
  const id = parseInt(reelId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid reel ID" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action === "like") {
      await incrementReelLikes(id);
      const reel = await getReel(id);
      const sign = await getUrlSigner("reels", reel ? [reel.videoUrl] : []);
      return NextResponse.json({
        success: true,
        message: "Reel liked",
        reel: reel ? { ...reel, videoUrl: sign(reel.videoUrl) } : null,
      });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Failed to process reel action" }, { status: 500 });
  }
}
