import { NextRequest, NextResponse, after } from "next/server";
import { processB2DeleteQueue } from "@/lib/b2Cleanup";
import { requireStaff } from "@/lib/auth";
import { deleteEpisodeAdmin, logActivity } from "@/lib/db";
import { dramaForChange, dramaOwnerNote } from "@/lib/dramaAccess";
import { actorOf } from "@/lib/reelPermissions";

/** DELETE: removes one episode and its video file (staff who may change the drama). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ dramaId: string; ep: string }> }
) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { session } = auth;
  const { dramaId, ep } = await params;
  const dId = parseInt(dramaId, 10);
  const epNum = parseInt(ep, 10);
  const access = await dramaForChange(session, dId);
  if (!access.ok) return access.response;

  const episodes = await deleteEpisodeAdmin(dId, epNum);
  await logActivity(actorOf(session), {
    action: "episode.deleted",
    entityType: "drama",
    entityId: dId,
    summary: `Deleted episode ${epNum} of "${access.drama.title}"${dramaOwnerNote(session, access.drama)}`,
  });
  cleanUpStorageLater();
  return NextResponse.json({ success: true, episodes });
}

/** Remove the deleted/replaced Backblaze files after the response is sent. */
function cleanUpStorageLater() {
  after(() =>
    processB2DeleteQueue().catch((err) => console.error("Background B2 cleanup failed:", err))
  );
}
