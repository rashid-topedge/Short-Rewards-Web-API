import { NextRequest, NextResponse, after } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { processB2DeleteQueue } from "@/lib/b2Cleanup";
import { bulkDeleteDramasAdmin, bulkUpdateAllDramasPublish, bulkUpdateDramasPublish, logActivity } from "@/lib/db";
import { actorOf } from "@/lib/reelPermissions";

export const maxDuration = 300;

/**
 * Admin only.
 * POST { action: "publish" | "unpublish", dramaIds }
 * POST { action: "publish" | "unpublish", all: true, onlyWithEpisodes? }
 * POST { action: "delete", dramaIds }
 * POST { action: "delete", all: true, filter: { q?, status? }, excludeIds?: number[] }
 *      deletes every drama matching the list's search/filter except excludeIds
 * Deleting a drama also deletes its episodes and linked reels; their files are
 * removed from Backblaze in the background.
 */
export async function POST(req: NextRequest) {
  const session = await getStaffSession(req);
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body?.action;
    const ids = (v: unknown): number[] =>
      Array.isArray(v) ? v.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0) : [];

    if (action === "delete") {
      let count: number;
      let what: string;
      if (body?.all === true) {
        const f = body?.filter ?? {};
        const status = ["all", "published", "draft"].includes(f.status) ? f.status : "all";
        const query = typeof f.q === "string" ? f.q : undefined;
        const excludeIds = ids(body?.excludeIds).slice(0, 5000);
        count = await bulkDeleteDramasAdmin({ filter: { query, status }, excludeIds });
        what = `all ${status === "all" ? "" : status + " "}dramas${query ? ` matching "${query}"` : ""}${
          excludeIds.length ? ` except ${excludeIds.length} kept` : ""
        }`;
      } else {
        const dramaIds = ids(body?.dramaIds);
        if (dramaIds.length === 0) return NextResponse.json({ error: "No drama IDs provided" }, { status: 400 });
        count = await bulkDeleteDramasAdmin({ dramaIds });
        what = `${dramaIds.length} selected drama(s)`;
      }
      await logActivity(actorOf(session), {
        action: "drama.bulk_deleted",
        entityType: "drama",
        summary: `Deleted ${count} drama(s) (${what}) with their episodes and linked reels`,
      });
      after(() => processB2DeleteQueue().catch((err) => console.error("Background B2 cleanup failed:", err)));
      return NextResponse.json({ success: true, count, message: `${count} drama(s) deleted` });
    }

    if (action !== "publish" && action !== "unpublish") {
      return NextResponse.json({ error: "action must be publish, unpublish or delete" }, { status: 400 });
    }
    const isPublished = action === "publish";

    if (body?.all) {
      const onlyWithEpisodes = Boolean(body?.onlyWithEpisodes);
      await bulkUpdateAllDramasPublish(isPublished, onlyWithEpisodes);
      return NextResponse.json({
        success: true,
        message: `All dramas ${isPublished ? "published" : "unpublished"} successfully`,
      });
    }

    const dramaIds = ids(body?.dramaIds);
    if (dramaIds.length === 0) {
      return NextResponse.json({ error: "No drama IDs provided" }, { status: 400 });
    }

    const count = await bulkUpdateDramasPublish(dramaIds, isPublished);
    return NextResponse.json({
      success: true,
      count,
      message: `${count} dramas ${isPublished ? "published" : "unpublished"} successfully`,
    });
  } catch (err) {
    console.error("Bulk drama action failed:", err);
    return NextResponse.json({ error: "Failed to process bulk drama action" }, { status: 500 });
  }
}
