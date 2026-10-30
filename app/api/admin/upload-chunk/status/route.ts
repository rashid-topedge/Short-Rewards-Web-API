import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { canUploadTo } from "@/lib/reelPermissions";
import { getUploadSession, listUploadedChunks } from "@/lib/db";
import { ensureDirectUploads } from "@/lib/b2Direct";
import type { FolderType } from "@/lib/b2";

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const staff = auth.session;

  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId parameter" }, { status: 400 });
  }

  try {
    const session = await getUploadSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (!canUploadTo(staff, session.folderType)) {
      return NextResponse.json({ error: "Moderators can only upload reels." }, { status: 403 });
    }
    const direct = await ensureDirectUploads(session.folderType as FolderType);
    return NextResponse.json({
      success: true,
      uploadMode: direct.ok ? "direct" : "server",
      directProblem: direct.ok ? null : direct.reason,
      sessionId: session.sessionId,
      fileName: session.fileName,
      fileSize: session.fileSize,
      totalChunks: session.totalChunks,
      uploadedChunks: await listUploadedChunks(sessionId),
      createdAt: session.createdAt,
    });
  } catch (err: unknown) {
    console.error("Status check error:", err);
    return NextResponse.json({ error: "Failed to read session status" }, { status: 500 });
  }
}
