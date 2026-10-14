import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { getReel, updateReelAdmin, deleteReelAdmin } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reelId: string }> }
) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reelId } = await params;
  const id = parseInt(reelId, 10);
  const reel = getReel(id, true);
  if (!reel) {
    return NextResponse.json({ error: "Reel not found" }, { status: 404 });
  }
  return NextResponse.json(reel);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ reelId: string }> }
) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { reelId } = await params;
    const id = parseInt(reelId, 10);
    const body = await req.json();

    const tags = Array.isArray(body.tags)
      ? body.tags
      : typeof body.tags === "string"
      ? body.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : undefined;

    const reel = updateReelAdmin(id, {
      title: body.title,
      synopsis: body.synopsis,
      videoUrl: body.videoUrl,
      thumbnailUrl: body.thumbnailUrl,
      durationSeconds: body.durationSeconds !== undefined ? Number(body.durationSeconds) : undefined,
      dramaId: body.dramaId !== undefined ? (body.dramaId ? Number(body.dramaId) : null) : undefined,
      episodeNumber: body.episodeNumber !== undefined ? (body.episodeNumber ? Number(body.episodeNumber) : null) : undefined,
      tags,
      isPublished: body.isPublished !== undefined ? Boolean(body.isPublished) : undefined,
      viewCount: body.viewCount !== undefined ? Number(body.viewCount) : undefined,
      likeCount: body.likeCount !== undefined ? Number(body.likeCount) : undefined,
    });

    if (!reel) {
      return NextResponse.json({ error: "Reel not found" }, { status: 404 });
    }

    return NextResponse.json(reel);
  } catch {
    return NextResponse.json({ error: "Failed to update reel" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ reelId: string }> }
) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reelId } = await params;
  const id = parseInt(reelId, 10);
  deleteReelAdmin(id);
  return NextResponse.json({ success: true, message: "Reel deleted successfully" });
}
