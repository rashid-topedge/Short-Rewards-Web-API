import { NextRequest, NextResponse } from "next/server";
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

  const episodes = deleteEpisodeAdmin(dId, epNum);
  return NextResponse.json({ success: true, episodes });
}