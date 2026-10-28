import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { canUploadTo } from "@/lib/reelPermissions";
import { getUploadSession, listUploadedChunks } from "@/lib/db";

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
    return NextResponse.json({
      success: true,
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
