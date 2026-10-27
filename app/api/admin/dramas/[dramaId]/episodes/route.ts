import { NextRequest, NextResponse, after } from "next/server";
import { processB2DeleteQueue } from "@/lib/b2Cleanup";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { listEpisodes, saveEpisodeAdmin } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dramaId: string }> }
) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { dramaId } = await params;
  const id = parseInt(dramaId, 10);
  const episodes = await listEpisodes(id, true);
  return NextResponse.json({ dramaId: id, episodes });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ dramaId: string }> }
) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { dramaId } = await params;
    const id = parseInt(dramaId, 10);
    const body = await req.json();
    const ep = Number(body?.ep);
    const url = typeof body?.url === "string" ? body.url.trim() : "";

    if (!Number.isInteger(ep) || ep <= 0 || !url) {
      return NextResponse.json({ error: "Valid episode number and URL are required" }, { status: 400 });
    }

    const episodes = await saveEpisodeAdmin(id, ep, url);
    cleanUpStorageLater(); // in case an existing episode's video was replaced
    return NextResponse.json({ success: true, episodes });
  } catch (err: unknown) {
    return NextResponse.json({ error: "Failed to save episode" }, { status: 500 });
  }
}

/** Remove the deleted/replaced Backblaze files after the response is sent. */
function cleanUpStorageLater() {
  after(() =>
    processB2DeleteQueue().catch((err) => console.error("Background B2 cleanup failed:", err))
  );
}
