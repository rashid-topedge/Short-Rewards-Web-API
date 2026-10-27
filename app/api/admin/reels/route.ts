import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { listReelsAdmin, createReelAdmin } from "@/lib/db";
import { getUrlSigner } from "@/lib/b2";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") || "";
  const status = (searchParams.get("status") || "all") as "all" | "published" | "draft";
  const dramaIdParam = searchParams.get("dramaId");
  const dramaId = dramaIdParam ? parseInt(dramaIdParam, 10) : undefined;
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const data = await listReelsAdmin({
    query,
    status,
    dramaId: isNaN(dramaId as number) ? undefined : dramaId,
    limit,
    offset,
    cursor: searchParams.get("cursor"),
  });

  // videoUrl/thumbnailUrl stay as stored (they're what the edit form saves back);
  // the preview* fields are signed so private-bucket media plays in the console.
  const sign = await getUrlSigner("reels", data.items.flatMap((r) => [r.videoUrl, r.thumbnailUrl || ""]));
  return NextResponse.json({
    ...data,
    items: data.items.map((r) => ({
      ...r,
      previewVideoUrl: sign(r.videoUrl),
      previewThumbnailUrl: r.thumbnailUrl ? sign(r.thumbnailUrl) : null,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    const reel = await createReelAdmin({
      title: body.title,
      synopsis: body.synopsis,
      videoUrl: body.videoUrl,
      thumbnailUrl: body.thumbnailUrl,
      durationSeconds: Number(body.durationSeconds) || 0,
      dramaId: body.dramaId ? Number(body.dramaId) : null,
      episodeNumber: body.episodeNumber ? Number(body.episodeNumber) : null,
      tags,
      isPublished: Boolean(body.isPublished),
    });

    return NextResponse.json(reel);
  } catch {
    return NextResponse.json({ error: "Failed to create reel" }, { status: 500 });
  }
}
