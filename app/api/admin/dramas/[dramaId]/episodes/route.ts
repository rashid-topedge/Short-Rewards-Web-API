import { NextRequest, NextResponse } from "next/server";
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
  const episodes = listEpisodes(id);
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

    const episodes = saveEpisodeAdmin(id, ep, url);
    return NextResponse.json({ success: true, episodes });
  } catch (err: unknown) {
    return NextResponse.json({ error: "Failed to save episode" }, { status: 500 });
  }
}