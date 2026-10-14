import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { bulkUpdateDramasPublish, bulkUpdateAllDramasPublish } from "@/lib/db";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body?.action;
    const isPublished = action === "publish";

    if (body?.all) {
      const onlyWithEpisodes = Boolean(body?.onlyWithEpisodes);
      bulkUpdateAllDramasPublish(isPublished, onlyWithEpisodes);
      return NextResponse.json({
        success: true,
        message: `All dramas ${isPublished ? "published" : "unpublished"} successfully`,
      });
    }

    const dramaIds: number[] = Array.isArray(body?.dramaIds)
      ? body.dramaIds.map((n: unknown) => Number(n)).filter((n: number) => !isNaN(n))
      : [];

    if (dramaIds.length === 0) {
      return NextResponse.json({ error: "No drama IDs provided" }, { status: 400 });
    }

    const count = bulkUpdateDramasPublish(dramaIds, isPublished);
    return NextResponse.json({
      success: true,
      count,
      message: `${count} dramas ${isPublished ? "published" : "unpublished"} successfully`,
    });
  } catch {
    return NextResponse.json({ error: "Failed to process bulk drama action" }, { status: 500 });
  }
}
