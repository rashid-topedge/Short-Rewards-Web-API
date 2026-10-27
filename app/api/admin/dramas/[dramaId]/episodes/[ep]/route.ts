import { NextRequest, NextResponse, after } from "next/server";
import { processB2DeleteQueue } from "@/lib/b2Cleanup";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { deleteEpisodeAdmin } from "@/lib/db";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ dramaId: string; ep: string }> }
) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { dramaId, ep } = await params;
  const dId = parseInt(dramaId, 10);
  const epNum = parseInt(ep, 10);

  const episodes = await deleteEpisodeAdmin(dId, epNum);
  cleanUpStorageLater();
  return NextResponse.json({ success: true, episodes });
}

/** Remove the deleted/replaced Backblaze files after the response is sent. */
function cleanUpStorageLater() {
  after(() =>
    processB2DeleteQueue().catch((err) => console.error("Background B2 cleanup failed:", err))
  );
}
