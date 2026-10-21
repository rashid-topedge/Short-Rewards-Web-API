import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId parameter" }, { status: 400 });
  }

  const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
  const tempDir = path.resolve(process.cwd(), "public", "uploads", ".temp-chunks", sanitizedSessionId);
  const sessionPath = path.join(tempDir, "session.json");

  if (!fs.existsSync(sessionPath)) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const sessionData = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
    return NextResponse.json({
      success: true,
      sessionId: sessionData.sessionId,
      fileName: sessionData.fileName,
      fileSize: sessionData.fileSize,
      totalChunks: sessionData.totalChunks,
      uploadedChunks: sessionData.uploadedChunks || [],
      createdAt: sessionData.createdAt,
    });
  } catch (err: unknown) {
    console.error("Status check error:", err);
    return NextResponse.json({ error: "Failed to read session status" }, { status: 500 });
  }
}
