import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { bulkUpdateReelsPublish } from "@/lib/db";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body?.action;
    const isPublished = action === "publish";

    const reelIds: number[] = Array.isArray(body?.reelIds)
      ? body.reelIds.map((n: unknown) => Number(n)).filter((n: number) => !isNaN(n))
      : [];

    if (reelIds.length === 0) {
      return NextResponse.json({ error: "No reel IDs provided" }, { status: 400 });
    }

    const count = await bulkUpdateReelsPublish(reelIds, isPublished);
    return NextResponse.json({
      success: true,
      count,
      message: `${count} reels ${isPublished ? "published" : "unpublished"} successfully`,
    });
  } catch {
    return NextResponse.json({ error: "Failed to process bulk reels action" }, { status: 500 });
  }
}
