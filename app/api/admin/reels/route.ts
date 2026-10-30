import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { createReelAdmin, getReelAdmin, listReelsAdmin, logActivity } from "@/lib/db";
import { getUrlSigner } from "@/lib/b2";
import { actorOf, reelPermissions } from "@/lib/reelPermissions";

/**
 * GET /api/admin/reels?status=all|published|draft|pending&mine=1&q=&cursor=
 * Admins and moderators. Each item carries `permissions` for the signed-in user.
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status") || "all";
  const status = (["all", "published", "draft", "pending"].includes(statusParam) ? statusParam : "all") as
    | "all"
    | "published"
    | "draft"
    | "pending";
  const dramaIdParam = searchParams.get("dramaId");
  const dramaId = dramaIdParam ? parseInt(dramaIdParam, 10) : undefined;
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const data = await listReelsAdmin({
    query: searchParams.get("q") || "",
    status,
    dramaId: dramaId !== undefined && !isNaN(dramaId) ? dramaId : undefined,
    createdById: searchParams.get("mine") === "1" ? session.actorId : undefined,
    limit,
    offset,
    cursor: searchParams.get("cursor"),
  });

  // videoUrl/thumbnailUrl stay as stored (they're what the edit form saves back);
  // the preview* fields are signed so private-bucket media plays in the console.
  const sign = await getUrlSigner(
    "reels",
    data.items.flatMap((r) => [
      r.videoUrl,
      r.thumbnailUrl || "",
      r.pendingChanges?.videoUrl || "",
      r.pendingChanges?.thumbnailUrl || "",
    ])
  );
  return NextResponse.json({
    ...data,
    items: data.items.map((r) => ({
      ...r,
      permissions: reelPermissions(session, r),
      previewVideoUrl: sign(r.videoUrl),
      previewThumbnailUrl: r.thumbnailUrl ? sign(r.thumbnailUrl) : null,
      pendingPreview: r.pendingChanges
        ? {
            videoUrl: r.pendingChanges.videoUrl ? sign(r.pendingChanges.videoUrl) : null,
            thumbnailUrl: r.pendingChanges.thumbnailUrl ? sign(r.pendingChanges.thumbnailUrl) : null,
          }
        : null,
    })),
  });
}

/**
 * POST /api/admin/reels
 * Admin: creates the reel, published or not (`isPublished`).
 * Moderator: same (approval is off). APPROVAL FLOW (disabled): always
 * unpublished; `submitForReview: true` sent it for approval, otherwise a draft.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  try {
    const body = await req.json();
    if (!body?.title || typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!body?.videoUrl || typeof body.videoUrl !== "string" || !body.videoUrl.trim()) {
      return NextResponse.json({ error: "Video URL is required" }, { status: 400 });
    }

    const tags = Array.isArray(body.tags)
      ? body.tags
      : typeof body.tags === "string"
      ? body.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : [];

    const isModerator = session.role === "moderator";
    // APPROVAL FLOW (disabled): moderators' reels were always saved unpublished,
    // as a draft or submitted for approval:
    // const submit = isModerator && (body.submitForReview === true || body.isPublished === true);
    const submit = false;

    const reel = await createReelAdmin({
      title: body.title,
      synopsis: body.synopsis,
      videoUrl: body.videoUrl,
      thumbnailUrl: body.thumbnailUrl,
      durationSeconds: Number(body.durationSeconds) || 0,
      dramaId: body.dramaId ? Number(body.dramaId) : null,
      episodeNumber: body.episodeNumber ? Number(body.episodeNumber) : null,
      tags,
      // APPROVAL FLOW (disabled):
      // isPublished: isModerator ? false : Boolean(body.isPublished),
      // reviewStatus: isModerator ? (submit ? "pending" : "draft") : null,
      isPublished: Boolean(body.isPublished),
      reviewStatus: null,
      createdBy: { id: session.actorId, name: session.displayName },
    });

    await logActivity(actorOf(session), {
      action: isModerator && submit ? "reel.submitted" : "reel.created",
      entityType: "reel",
      entityId: reel.reelId,
      summary: `Created reel "${reel.title}"${reel.isPublished ? " (published)" : " (draft)"}`,
    });

    const full = await getReelAdmin(reel.reelId);
    return NextResponse.json(full ? { ...full, permissions: reelPermissions(session, full) } : reel);
  } catch (err) {
    console.error("Failed to create reel:", err);
    return NextResponse.json({ error: "Failed to create reel" }, { status: 500 });
  }
}
