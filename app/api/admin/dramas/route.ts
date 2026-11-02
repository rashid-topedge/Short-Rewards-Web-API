import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { listDramasAdmin, createDramaAdmin, dramaStorageFolderInUse, logActivity } from "@/lib/db";
import { dramaPermissions, validNewDramaFolder } from "@/lib/dramaAccess";
import { actorOf } from "@/lib/reelPermissions";

/**
 * GET /api/admin/dramas?q=&status=&mine=1
 * Every staff member can see the list (moderators also use it to pick a drama
 * for a reel); each item says what the viewer may do with it.
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { session } = auth;
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") || "";
  const status = (searchParams.get("status") || "all") as "all" | "published" | "draft";
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const cursor = searchParams.get("cursor");
  const data = await listDramasAdmin({
    query,
    status,
    limit,
    offset,
    cursor,
    createdById: searchParams.get("mine") === "1" ? session.actorId : undefined,
  });
  return NextResponse.json({
    ...data,
    items: data.items.map((d) => ({ ...d, permissions: dramaPermissions(session, d.createdById) })),
  });
}

/**
 * POST /api/admin/dramas: creates a drama (admin and moderators). The creator
 * is recorded; moderators can't set play/like counts.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { session } = auth;
  const isAdmin = session.role === "admin";
  try {
    const body = await req.json();
    if (!body?.title || typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    // The folder the cover was uploaded to before the drama existed (if any).
    let storageFolder = validNewDramaFolder(body.storageFolder);
    if (storageFolder && (await dramaStorageFolderInUse(storageFolder))) storageFolder = null;

    const drama = await createDramaAdmin({
      title: body.title,
      slug: body.slug,
      cover: body.cover,
      synopsis: body.synopsis,
      tags: Array.isArray(body.tags) ? body.tags : typeof body.tags === "string" ? body.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
      playCount: isAdmin ? Number(body.playCount) || 0 : 0,
      likeCount: isAdmin ? Number(body.likeCount) || 0 : 0,
      episodeCount: isAdmin ? Number(body.episodeCount) || 0 : 0,
      latestEpisodeLabel: body.latestEpisodeLabel,
      isPublished: Boolean(body.isPublished),
      createdBy: { id: session.actorId, name: session.displayName },
      storageFolder,
    });

    await logActivity(actorOf(session), {
      action: "drama.created",
      entityType: "drama",
      entityId: drama.dramaId,
      summary: `Created drama "${drama.title}"${drama.isPublished ? " (published)" : ""}`,
    });
    return NextResponse.json({ ...drama, permissions: dramaPermissions(session, drama.createdById) });
  } catch {
    return NextResponse.json({ error: "Failed to create drama" }, { status: 500 });
  }
}
