import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import fs from "fs";
import path from "path";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const sessionId = formData.get("sessionId") as string;
    const chunkIndexStr = formData.get("chunkIndex") as string;
    const chunkFile = formData.get("chunk") as File;

    if (!sessionId || chunkIndexStr === null || !chunkFile) {
      return NextResponse.json({ error: "Missing sessionId, chunkIndex, or chunk payload" }, { status: 400 });
    }

    const chunkIndex = parseInt(chunkIndexStr, 10);
    const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
    const tempDir = path.resolve(process.cwd(), "public", "uploads", ".temp-chunks", sanitizedSessionId);

    if (!fs.existsSync(tempDir)) {
      return NextResponse.json({ error: "Upload session not found or expired" }, { status: 404 });
    }

    const chunkBytes = await chunkFile.arrayBuffer();
    const chunkBuffer = Buffer.from(chunkBytes);
    const chunkPath = path.join(tempDir, `chunk_${chunkIndex}.part`);

    fs.writeFileSync(chunkPath, chunkBuffer);

    // Update session record
    const sessionPath = path.join(tempDir, "session.json");
    let sessionData = { uploadedChunks: [] as number[], totalChunks: 0 };
    if (fs.existsSync(sessionPath)) {
      try {
        sessionData = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
      } catch {
        // ignore parse error
      }
    }

    if (!sessionData.uploadedChunks.includes(chunkIndex)) {
      sessionData.uploadedChunks.push(chunkIndex);
      sessionData.uploadedChunks.sort((a, b) => a - b);
      fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
    }

    return NextResponse.json({
      success: true,
      chunkIndex,
      uploadedCount: sessionData.uploadedChunks.length,
      totalChunks: sessionData.totalChunks,
      uploadedChunks: sessionData.uploadedChunks,
    });
  } catch (err: unknown) {
    console.error("Chunk part upload error:", err);
    return NextResponse.json({ error: "Failed to save upload chunk" }, { status: 500 });
  }
}
