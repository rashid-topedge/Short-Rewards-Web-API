import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { bulkUpdateReelsPublish, logActivity } from "@/lib/db";
import { actorOf } from "@/lib/reelPermissions";

/** Admin only: publish/unpublish many reels (publishing also approves them). */
export async function POST(req: NextRequest) {
  const session = await getStaffSession(req);
  if (session?.role !== "admin") {
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
    await logActivity(actorOf(session), {
      action: isPublished ? "reel.bulk_published" : "reel.bulk_unpublished",
      entityType: "reel",
      summary: `${isPublished ? "Published" : "Unpublished"} ${count} reel(s)`,
      details: { reelIds: reelIds.slice(0, 200) },
    });
    return NextResponse.json({
      success: true,
      count,
      message: `${count} reels ${isPublished ? "published" : "unpublished"} successfully`,
    });
  } catch {
    return NextResponse.json({ error: "Failed to process bulk reels action" }, { status: 500 });
  }
}
