import { NextRequest, NextResponse, after } from "next/server";
import { processB2DeleteQueue } from "@/lib/b2Cleanup";
import { requireStaff } from "@/lib/auth";
import {
  deleteReelAdmin,
  getReelAdmin,
  logActivity,
  moderatorDeleteReel,
  moderatorEditReel,
  updateReelAdmin,
} from "@/lib/db";
import { actorOf, MODERATOR_APPROVAL_REQUIRED, reelChangesFromBody, reelPermissions } from "@/lib/reelPermissions";

type Ctx = { params: Promise<{ reelId: string }> };

async function reelIdFrom(ctx: Ctx): Promise<number | null> {
  const id = parseInt((await ctx.params).reelId, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const id = await reelIdFrom(ctx);
  const reel = id ? await getReelAdmin(id) : null;
  if (!reel) return NextResponse.json({ error: "Reel not found" }, { status: 404 });
  return NextResponse.json({ ...reel, permissions: reelPermissions(auth.session, reel) });
}

/**
 * PUT /api/admin/reels/:id
 * Admin: edits anything, including publishing.
 * Moderator (own reels only): edits title/description/tags/drama/episode,
 * may replace the video or thumbnail, and publish/unpublish. Changes apply
 * immediately (approval is off). Never view/like counts.
 * APPROVAL FLOW (disabled): on a live reel the edits were saved as pending
 * changes for approval; `submitForReview: true` sent a draft for approval;
 * `isPublished: false` hid their live reel (it became a draft).
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  try {
    const id = await reelIdFrom(ctx);
    if (!id) return NextResponse.json({ error: "Reel not found" }, { status: 404 });
    const body = (await req.json()) as Record<string, unknown>;
    const before = await getReelAdmin(id);
    if (!before) return NextResponse.json({ error: "Reel not found" }, { status: 404 });

    if (session.role === "moderator" && !MODERATOR_APPROVAL_REQUIRED) {
      if (before.createdById !== session.actorId) {
        return NextResponse.json({ error: "You can only change reels you uploaded.", code: "NOT_OWNER" }, { status: 403 });
      }
      const changes = reelChangesFromBody(body);
      if (changes.title !== undefined && !changes.title.trim()) {
        return NextResponse.json({ error: "Title is required" }, { status: 400 });
      }
      const publish = typeof body.isPublished === "boolean" ? body.isPublished : undefined;
      const reel = await updateReelAdmin(
        id,
        {
          ...changes,
          synopsis: changes.synopsis === null ? "" : changes.synopsis,
          thumbnailUrl: changes.thumbnailUrl === null ? "" : changes.thumbnailUrl,
          isPublished: publish,
        },
        { name: session.displayName }
      );
      if (!reel) return NextResponse.json({ error: "Reel not found" }, { status: 404 });

      const toggled = publish !== undefined && publish !== before.isPublished;
      const onlyToggle = toggled && Object.keys(changes).length === 0;
      await logActivity(actorOf(session), {
        action: onlyToggle ? (publish ? "reel.published" : "reel.unpublished") : "reel.edited",
        entityType: "reel",
        entityId: id,
        summary: onlyToggle
          ? `${publish ? "Published" : "Unpublished"} "${reel.title}"`
          : `Edited "${reel.title}"${toggled ? (publish ? " and published it" : " and unpublished it") : ""}`,
        details: Object.keys(changes).length ? { fields: Object.keys(changes) } : null,
      });
      cleanUpStorageLater(); // in case the video or thumbnail was replaced
      const full = await getReelAdmin(id);
      return NextResponse.json(full ? { ...full, permissions: reelPermissions(session, full), mode: "applied" } : reel);
    }

    // APPROVAL FLOW (disabled while MODERATOR_APPROVAL_REQUIRED is false): kept for later.
    if (session.role === "moderator") {
      const changes = reelChangesFromBody(body);
      if (changes.title !== undefined && !changes.title.trim()) {
        return NextResponse.json({ error: "Title is required" }, { status: 400 });
      }
      const unpublish = body.isPublished === false && before.isPublished;
      const submit = body.submitForReview === true || (body.isPublished === true && !before.isPublished);

      const result = await moderatorEditReel(id, actorOf(session), changes, { submit, unpublish });
      if (!result.ok) {
        return result.reason === "not_owner"
          ? NextResponse.json({ error: "You can only change reels you uploaded.", code: "NOT_OWNER" }, { status: 403 })
          : NextResponse.json({ error: "Reel not found" }, { status: 404 });
      }

      const parts: string[] = [];
      if (unpublish) parts.push("unpublished");
      const nothingChanged = before.isPublished && !unpublish && result.mode === "applied";
      if (Object.keys(changes).length && !nothingChanged) parts.push(result.mode === "pending-changes" ? "proposed changes" : "edited");
      if (submit) parts.push("submitted for approval");
      if (parts.length) {
        await logActivity(actorOf(session), {
          action: unpublish ? "reel.unpublished" : submit ? "reel.submitted" : result.mode === "pending-changes" ? "reel.changes_proposed" : "reel.edited",
          entityType: "reel",
          entityId: id,
          summary: `${parts.join(", ").replace(/^./, (c) => c.toUpperCase())}: "${result.reel.title}"`,
          details: Object.keys(changes).length ? { fields: Object.keys(changes) } : null,
        });
      }

      cleanUpStorageLater();
      return NextResponse.json({
        ...result.reel,
        permissions: reelPermissions(session, result.reel),
        mode: result.mode,
      });
    }

    // Admin
    const tags = Array.isArray(body.tags)
      ? (body.tags as unknown[]).map(String)
      : typeof body.tags === "string"
      ? body.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : undefined;

    const reel = await updateReelAdmin(
      id,
      {
        title: body.title as string | undefined,
        synopsis: body.synopsis as string | undefined,
        videoUrl: body.videoUrl as string | undefined,
        thumbnailUrl: body.thumbnailUrl as string | undefined,
        durationSeconds: body.durationSeconds !== undefined ? Number(body.durationSeconds) : undefined,
        dramaId: body.dramaId !== undefined ? (body.dramaId ? Number(body.dramaId) : null) : undefined,
        episodeNumber:
          body.episodeNumber !== undefined ? (body.episodeNumber ? Number(body.episodeNumber) : null) : undefined,
        tags,
        isPublished: body.isPublished !== undefined ? Boolean(body.isPublished) : undefined,
        viewCount: body.viewCount !== undefined ? Number(body.viewCount) : undefined,
        likeCount: body.likeCount !== undefined ? Number(body.likeCount) : undefined,
      },
      { name: session.displayName }
    );
    if (!reel) return NextResponse.json({ error: "Reel not found" }, { status: 404 });

    const onlyPublishToggle = Object.keys(body).length === 1 && body.isPublished !== undefined;
    await logActivity(actorOf(session), {
      action: onlyPublishToggle ? (reel.isPublished ? "reel.published" : "reel.unpublished") : "reel.edited",
      entityType: "reel",
      entityId: id,
      summary: onlyPublishToggle
        ? `${reel.isPublished ? "Published" : "Unpublished"} "${reel.title}"`
        : `Edited "${reel.title}"`,
      details: onlyPublishToggle ? null : { fields: Object.keys(body) },
    });

    cleanUpStorageLater(); // in case the video or thumbnail was replaced
    const full = await getReelAdmin(id);
    return NextResponse.json(full ? { ...full, permissions: reelPermissions(session, full) } : reel);
  } catch (err) {
    console.error("Failed to update reel:", err);
    return NextResponse.json({ error: "Failed to update reel" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/reels/:id
 * Admin: any reel. Moderator: only their own reel that was never published.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const id = await reelIdFrom(ctx);
  const reel = id ? await getReelAdmin(id) : null;
  if (!id || !reel) return NextResponse.json({ error: "Reel not found" }, { status: 404 });

  if (session.role === "moderator") {
    const result = await moderatorDeleteReel(id, session.actorId);
    if (!result.ok) {
      const messages = {
        not_found: ["Reel not found", 404],
        not_owner: ["You can only delete reels you uploaded.", 403],
        was_published: ["Reels that have been published can't be deleted. You can unpublish it instead.", 403],
      } as const;
      const [error, status] = messages[result.reason];
      return NextResponse.json({ error, code: result.reason.toUpperCase() }, { status });
    }
  } else {
    await deleteReelAdmin(id);
  }

  await logActivity(actorOf(session), {
    action: "reel.deleted",
    entityType: "reel",
    entityId: id,
    summary: `Deleted "${reel.title}"`,
  });
  cleanUpStorageLater();
  return NextResponse.json({ success: true, message: "Reel deleted successfully" });
}

/** Remove the deleted/replaced Backblaze files after the response is sent. */
function cleanUpStorageLater() {
  after(() => processB2DeleteQueue().catch((err) => console.error("Background B2 cleanup failed:", err)));
}
