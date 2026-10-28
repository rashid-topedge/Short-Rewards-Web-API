import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin, requireStaff } from "@/lib/auth";
import { listDramasAdmin, createDramaAdmin } from "@/lib/db";

// Moderators may read the list (to pick a drama for a reel); writes stay admin-only.
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") || "";
  const status = (searchParams.get("status") || "all") as "all" | "published" | "draft";
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const cursor = searchParams.get("cursor");
  const data = await listDramasAdmin({ query, status, limit, offset, cursor });
  return NextResponse.json(data);
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

    const drama = await createDramaAdmin({
      title: body.title,
      slug: body.slug,
      cover: body.cover,
      synopsis: body.synopsis,
      tags: Array.isArray(body.tags) ? body.tags : typeof body.tags === "string" ? body.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
      playCount: Number(body.playCount) || 0,
      likeCount: Number(body.likeCount) || 0,
      episodeCount: Number(body.episodeCount) || 0,
      latestEpisodeLabel: body.latestEpisodeLabel,
      isPublished: Boolean(body.isPublished),
    });

    return NextResponse.json(drama);
  } catch {
    return NextResponse.json({ error: "Failed to create drama" }, { status: 500 });
  }
}
