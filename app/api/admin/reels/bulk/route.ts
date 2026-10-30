import { NextRequest, NextResponse, after } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { processB2DeleteQueue } from "@/lib/b2Cleanup";
import { bulkDeleteReelsAdmin, bulkUpdateReelsPublish, logActivity, type ReelAdminFilter } from "@/lib/db";
import { actorOf } from "@/lib/reelPermissions";

export const maxDuration = 300;

/**
 * Admin only.
 * POST { action: "publish" | "unpublish", reelIds }   (publishing also approves them)
 * POST { action: "delete", reelIds }                   deletes those reels
 * POST { action: "delete", all: true, filter: { q?, status?, mine? }, excludeIds?: number[] }
 *      deletes every reel matching the admin list's search/filter, except excludeIds
 * Deleted reels' video/thumbnail files are removed from Backblaze in the background.
 */
export async function POST(req: NextRequest) {
  const session = await getStaffSession(req);
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body?.action;

    const reelIds: number[] = Array.isArray(body?.reelIds)
      ? body.reelIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];

    if (action === "delete") {
      let count: number;
      let what: string;
      if (body?.all === true) {
        const f = body?.filter ?? {};
        const status = ["all", "published", "draft", "pending"].includes(f.status) ? f.status : "all";
        const filter: ReelAdminFilter = {
          query: typeof f.q === "string" ? f.q : undefined,
          status,
          createdById: f.mine === true ? session.actorId : undefined,
        };
        const excludeIds: number[] = Array.isArray(body?.excludeIds)
          ? body.excludeIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, 5000)
          : [];
        count = await bulkDeleteReelsAdmin({ filter, excludeIds });
        what = `all ${status === "all" ? "" : status + " "}reels${filter.query ? ` matching "${filter.query}"` : ""}${
          excludeIds.length ? ` except ${excludeIds.length} kept` : ""
        }`;
      } else {
        if (reelIds.length === 0) return NextResponse.json({ error: "No reel IDs provided" }, { status: 400 });
        count = await bulkDeleteReelsAdmin({ reelIds });
        what = `${reelIds.length} selected reel(s)`;
      }
      await logActivity(actorOf(session), {
        action: "reel.bulk_deleted",
        entityType: "reel",
        summary: `Deleted ${count} reel(s) (${what})`,
        details: reelIds.length ? { reelIds: reelIds.slice(0, 200) } : null,
      });
      after(() => processB2DeleteQueue().catch((err) => console.error("Background B2 cleanup failed:", err)));
      return NextResponse.json({ success: true, count, message: `${count} reel(s) deleted` });
    }

    if (action !== "publish" && action !== "unpublish") {
      return NextResponse.json({ error: "action must be publish, unpublish or delete" }, { status: 400 });
    }
    if (reelIds.length === 0) {
      return NextResponse.json({ error: "No reel IDs provided" }, { status: 400 });
    }
    const isPublished = action === "publish";
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
  } catch (err) {
    console.error("Bulk reels action failed:", err);
    return NextResponse.json({ error: "Failed to process bulk reels action" }, { status: 500 });
  }
}
