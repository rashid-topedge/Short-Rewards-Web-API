import { NextRequest, NextResponse, after } from "next/server";
import { processB2DeleteQueue } from "@/lib/b2Cleanup";
import { requireStaff } from "@/lib/auth";
import { deleteEpisodeAdmin, logActivity, updateEpisodeAdmin } from "@/lib/db";
import { dramaForChange, dramaOwnerNote } from "@/lib/dramaAccess";
import { withEpisodePreviews } from "@/lib/dramaMedia";
import { actorOf } from "@/lib/reelPermissions";

type Ctx = { params: Promise<{ dramaId: string; ep: string }> };

async function target(ctx: Ctx) {
  const { dramaId, ep } = await ctx.params;
  return { dramaId: parseInt(dramaId, 10), ep: parseInt(ep, 10) };
}

/** PATCH { title?, isPublished? }: renames or publishes/unpublishes one episode. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { session } = auth;
  const { dramaId, ep } = await target(ctx);
  const access = await dramaForChange(session, dramaId);
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as { title?: unknown; isPublished?: unknown };
  const changes: { title?: string | null; isPublished?: boolean } = {};
  if (body.title !== undefined) {
    if (body.title !== null && typeof body.title !== "string") {
      return NextResponse.json({ error: "Title must be text." }, { status: 400 });
    }
    if (typeof body.title === "string" && body.title.trim().length > 120) {
      return NextResponse.json({ error: "Episode title is too long (120 characters max)." }, { status: 400 });
    }
    changes.title = body.title as string | null;
  }
  if (typeof body.isPublished === "boolean") changes.isPublished = body.isPublished;
  if (!Object.keys(changes).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const episodes = await updateEpisodeAdmin(dramaId, ep, changes);
  if (!episodes) return NextResponse.json({ error: "Episode not found" }, { status: 404 });

  const what =
    changes.isPublished !== undefined && changes.title === undefined
      ? changes.isPublished
        ? "Published"
        : "Unpublished"
      : "Edited";
  await logActivity(actorOf(session), {
    action: what === "Edited" ? "episode.edited" : what === "Published" ? "episode.published" : "episode.unpublished",
    entityType: "drama",
    entityId: dramaId,
    summary: `${what} episode ${ep} of "${access.drama.title}"${dramaOwnerNote(session, access.drama)}`,
  });
  return NextResponse.json({ success: true, episodes: await withEpisodePreviews(episodes) });
}

/** DELETE: removes one episode and its video and thumbnail files (staff who may change the drama). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { session } = auth;
  const { dramaId, ep } = await target(ctx);
  const access = await dramaForChange(session, dramaId);
  if (!access.ok) return access.response;

  const episodes = await deleteEpisodeAdmin(dramaId, ep);
  await logActivity(actorOf(session), {
    action: "episode.deleted",
    entityType: "drama",
    entityId: dramaId,
    summary: `Deleted episode ${ep} of "${access.drama.title}"${dramaOwnerNote(session, access.drama)}`,
  });
  cleanUpStorageLater();
  return NextResponse.json({ success: true, episodes: await withEpisodePreviews(episodes) });
}

/** Remove the deleted/replaced Backblaze files after the response is sent. */
function cleanUpStorageLater() {
  after(() =>
    processB2DeleteQueue().catch((err) => console.error("Background B2 cleanup failed:", err))
  );
}
