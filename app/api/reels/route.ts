import { NextRequest, NextResponse } from "next/server";
import { listReels } from "@/lib/db";
import { getUrlSigner } from "@/lib/b2";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") || undefined;
  const limit = parseInt(searchParams.get("limit") || "10", 10);
  const dramaIdParam = searchParams.get("dramaId");
  const dramaId = dramaIdParam ? parseInt(dramaIdParam, 10) : undefined;
  const sortParam = searchParams.get("sort");
  const sort = sortParam === "trending" || sortParam === "random" ? sortParam : "newest";

  try {
    const data = await listReels({
      cursor,
      limit: Number.isFinite(limit) ? limit : 10,
      dramaId: dramaId !== undefined && !isNaN(dramaId) ? dramaId : undefined,
      sort,
    });
    const sign = await getUrlSigner(
      "reels",
      data.items.flatMap((r) => [r.videoUrl, r.thumbnailUrl || ""])
    );

    return NextResponse.json({
      ...data,
      items: data.items.map((reel) => ({
        ...reel,
        videoUrl: sign(reel.videoUrl),
        thumbnailUrl: reel.thumbnailUrl ? sign(reel.thumbnailUrl) : reel.thumbnailUrl,
      })),
    });
  } catch (err) {
    console.error("Failed to list reels:", err);
    return NextResponse.json({ error: "Failed to load reels" }, { status: 500 });
  }
}
