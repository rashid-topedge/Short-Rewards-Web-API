import { NextRequest, NextResponse, after } from "next/server";
import { processB2DeleteQueue } from "@/lib/b2Cleanup";
import { requireStaff } from "@/lib/auth";
import { listEpisodes, logActivity, saveEpisodeAdmin } from "@/lib/db";
import { dramaForChange, dramaOwnerNote } from "@/lib/dramaAccess";
import { actorOf } from "@/lib/reelPermissions";

type Ctx = { params: Promise<{ dramaId: string }> };

/** GET: the drama's episodes (staff who may change the drama). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const id = parseInt((await params).dramaId, 10);
  const access = await dramaForChange(auth.session, id);
  if (!access.ok) return access.response;
  const episodes = await listEpisodes(id, true);
  return NextResponse.json({ dramaId: id, episodes });
}

/**
 * POST { ep, url, isPublished?, ifNew? }: adds or replaces one episode.
 * With `ifNew: true` an existing episode number is not replaced (409
 * EPISODE_EXISTS), so a batch upload never overwrites an episode by mistake.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { session } = auth;
  try {
    const id = parseInt((await params).dramaId, 10);
    const access = await dramaForChange(session, id);
    if (!access.ok) return access.response;
    const body = await req.json();
    const ep = Number(body?.ep);
    const url = typeof body?.url === "string" ? body.url.trim() : "";

    if (!Number.isInteger(ep) || ep <= 0 || ep > 100000 || !url) {
      return NextResponse.json({ error: "Valid episode number and URL are required" }, { status: 400 });
    }

    const existing = (await listEpisodes(id, true)).find((e) => e.ep === ep);
    if (existing && body?.ifNew === true) {
      return NextResponse.json(
        { error: `Episode ${ep} already exists.`, code: "EPISODE_EXISTS" },
        { status: 409 }
      );
    }

    const episodes = await saveEpisodeAdmin(id, ep, url, body?.isPublished === undefined ? true : Boolean(body.isPublished));
    await logActivity(actorOf(session), {
      action: existing ? "episode.replaced" : "episode.added",
      entityType: "drama",
      entityId: id,
      summary: `${existing ? "Replaced" : "Added"} episode ${ep} of "${access.drama.title}"${dramaOwnerNote(session, access.drama)}`,
    });
    cleanUpStorageLater(); // in case an existing episode's video was replaced
    return NextResponse.json({ success: true, episodes });
  } catch {
    return NextResponse.json({ error: "Failed to save episode" }, { status: 500 });
  }
}

/** Remove the deleted/replaced Backblaze files after the response is sent. */
function cleanUpStorageLater() {
  after(() =>
    processB2DeleteQueue().catch((err) => console.error("Background B2 cleanup failed:", err))
  );
}
