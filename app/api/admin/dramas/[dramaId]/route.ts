import { NextRequest, NextResponse, after } from "next/server";
import { processB2DeleteQueue } from "@/lib/b2Cleanup";
import { requireStaff } from "@/lib/auth";
import { getDrama, updateDramaAdmin, deleteDramaAdmin, logActivity } from "@/lib/db";
import { dramaForChange, dramaOwnerNote, dramaPermissions } from "@/lib/dramaAccess";
import { actorOf, canManageOwned } from "@/lib/reelPermissions";
import { getDramaOwnerInfo } from "@/lib/db";
import { withCoverPreviews } from "@/lib/dramaMedia";

type Ctx = { params: Promise<{ dramaId: string }> };

/**
 * GET /api/admin/dramas/:id
 * Everyone on the staff can look a drama up (for the reel drama picker), with
 * what they may do with it. Episodes come from /episodes (owners only).
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const id = parseInt((await params).dramaId, 10);
  const [drama, owner] = await Promise.all([getDrama(id, true), getDramaOwnerInfo(id)]);
  if (!drama || !owner) {
    return NextResponse.json({ error: "Drama not found" }, { status: 404 });
  }
  const [withPreview] = await withCoverPreviews([drama]);
  return NextResponse.json({
    ...withPreview,
    createdById: owner.createdById,
    createdByName: owner.createdByName,
    permissions: dramaPermissions(auth.session, owner.createdById),
  });
}

/**
 * PUT /api/admin/dramas/:id
 * Admin: anything. Moderators (dramas they may change): title, cover,
 * description, tags, publish. Never play/like counts.
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { session } = auth;
  try {
    const id = parseInt((await params).dramaId, 10);
    const access = await dramaForChange(session, id);
    if (!access.ok) return access.response;
    const isAdmin = session.role === "admin";
    const body = await req.json();

    const tags = Array.isArray(body.tags)
      ? body.tags
      : typeof body.tags === "string"
      ? body.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : undefined;
    if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim())) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const before = await getDrama(id, true);
    const drama = await updateDramaAdmin(id, {
      title: body.title,
      cover: body.cover,
      synopsis: body.synopsis,
      tags,
      playCount: isAdmin && body.playCount !== undefined ? Number(body.playCount) : undefined,
      likeCount: isAdmin && body.likeCount !== undefined ? Number(body.likeCount) : undefined,
      episodeCount: isAdmin && body.episodeCount !== undefined ? Number(body.episodeCount) : undefined,
      latestEpisodeLabel: body.latestEpisodeLabel,
      isPublished: body.isPublished !== undefined ? Boolean(body.isPublished) : undefined,
    });

    if (!drama) {
      return NextResponse.json({ error: "Drama not found" }, { status: 404 });
    }
    const toggled = before && body.isPublished !== undefined && Boolean(body.isPublished) !== Boolean(before.isPublished);
    const onlyToggle = toggled && Object.keys(body).length === 1;
    await logActivity(actorOf(session), {
      action: onlyToggle ? (drama.isPublished ? "drama.published" : "drama.unpublished") : "drama.edited",
      entityType: "drama",
      entityId: id,
      summary:
        (onlyToggle ? `${drama.isPublished ? "Published" : "Unpublished"} drama "${drama.title}"` : `Edited drama "${drama.title}"`) +
        dramaOwnerNote(session, access.drama),
    });
    cleanUpStorageLater(); // in case the cover was replaced
    return NextResponse.json({ ...drama, permissions: dramaPermissions(session, access.drama.createdById) });
  } catch {
    return NextResponse.json({ error: "Failed to update drama" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/dramas/:id: removes the drama, its episodes and their files.
 * Linked reels are deleted too when the deleter may delete them; a
 * moderator's delete only unlinks reels they can't manage (e.g. the admin's).
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { session } = auth;
  const id = parseInt((await params).dramaId, 10);
  const access = await dramaForChange(session, id);
  if (!access.ok) return access.response;

  const ok =
    session.role === "admin"
      ? await deleteDramaAdmin(id)
      : await deleteDramaAdmin(id, {
          mayDeleteDrama: (createdById) => canManageOwned(session, createdById),
          mayDeleteReel: (createdById) => canManageOwned(session, createdById),
        });
  if (!ok) return NextResponse.json({ error: "Drama not found" }, { status: 404 });

  await logActivity(actorOf(session), {
    action: "drama.deleted",
    entityType: "drama",
    entityId: id,
    summary: `Deleted drama "${access.drama.title}"${dramaOwnerNote(session, access.drama)}`,
  });
  cleanUpStorageLater();
  return NextResponse.json({ success: true, message: "Drama deleted successfully" });
}

/** Remove the deleted/replaced Backblaze files after the response is sent. */
function cleanUpStorageLater() {
  after(() =>
    processB2DeleteQueue().catch((err) => console.error("Background B2 cleanup failed:", err))
  );
}
