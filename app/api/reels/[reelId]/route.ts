import { NextRequest, NextResponse } from "next/server";
import { getReel, incrementReelViews, incrementReelLikes } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reelId: string }> }
) {
  const { reelId } = await params;
  const id = parseInt(reelId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid reel ID" }, { status: 400 });
  }

  const reel = await getReel(id);
  if (!reel) {
    return NextResponse.json({ error: "Reel not found" }, { status: 404 });
  }

  await incrementReelViews(id);

  return NextResponse.json(reel);
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
      return NextResponse.json({ success: true, message: "Reel liked" });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Failed to process reel action" }, { status: 500 });
  }
}
