import { NextRequest, NextResponse, after } from "next/server";
import { processB2DeleteQueue } from "@/lib/b2Cleanup";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { getDrama, updateDramaAdmin, deleteDramaAdmin } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dramaId: string }> }
) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { dramaId } = await params;
  const id = parseInt(dramaId, 10);
  const drama = await getDrama(id, true);
  if (!drama) {
    return NextResponse.json({ error: "Drama not found" }, { status: 404 });
  }
  return NextResponse.json(drama);
}

export async function PUT(
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

    const tags = Array.isArray(body.tags)
      ? body.tags
      : typeof body.tags === "string"
      ? body.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : undefined;

    const drama = await updateDramaAdmin(id, {
      title: body.title,
      cover: body.cover,
      synopsis: body.synopsis,
      tags,
      playCount: body.playCount !== undefined ? Number(body.playCount) : undefined,
      likeCount: body.likeCount !== undefined ? Number(body.likeCount) : undefined,
      episodeCount: body.episodeCount !== undefined ? Number(body.episodeCount) : undefined,
      latestEpisodeLabel: body.latestEpisodeLabel,
      isPublished: body.isPublished !== undefined ? Boolean(body.isPublished) : undefined,
    });

    if (!drama) {
      return NextResponse.json({ error: "Drama not found" }, { status: 404 });
    }
    cleanUpStorageLater(); // in case the cover was replaced
    return NextResponse.json(drama);
  } catch {
    return NextResponse.json({ error: "Failed to update drama" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ dramaId: string }> }
) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { dramaId } = await params;
  const id = parseInt(dramaId, 10);
  await deleteDramaAdmin(id);
  cleanUpStorageLater();
  return NextResponse.json({ success: true, message: "Drama deleted successfully" });
}

/** Remove the deleted/replaced Backblaze files after the response is sent. */
function cleanUpStorageLater() {
  after(() =>
    processB2DeleteQueue().catch((err) => console.error("Background B2 cleanup failed:", err))
  );
}
