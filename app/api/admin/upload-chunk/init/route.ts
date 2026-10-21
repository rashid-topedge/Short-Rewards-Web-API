import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { FolderType, getB2ConfigForFolder } from "@/lib/b2";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { fileName, fileSize, folderType, targetName, totalChunks, chunkSize, mimeType } = body;

    if (!fileName || !fileSize || !folderType || !totalChunks) {
      return NextResponse.json(
        { error: "Missing required initialization fields" },
        { status: 400 }
      );
    }

    const sessionId = `up_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const tempDir = path.resolve(process.cwd(), "public", "uploads", ".temp-chunks", sessionId);
    fs.mkdirSync(tempDir, { recursive: true });

    const sessionData = {
      sessionId,
      fileName,
      fileSize,
      folderType: folderType as FolderType,
      targetName: targetName || `item_${Date.now()}`,
      totalChunks,
      chunkSize: chunkSize || 5 * 1024 * 1024,
      mimeType: mimeType || "application/octet-stream",
      uploadedChunks: [] as number[],
      createdAt: Date.now(),
    };

    fs.writeFileSync(path.join(tempDir, "session.json"), JSON.stringify(sessionData, null, 2));

    const b2Config = await getB2ConfigForFolder(folderType as FolderType);

    return NextResponse.json({
      success: true,
      sessionId,
      chunkSize: sessionData.chunkSize,
      totalChunks,
      uploadedChunks: [],
      isB2Configured: !!b2Config,
      targetBucketId: b2Config?.bucketId || null,
    });
  } catch (err: unknown) {
    console.error("Upload session init error:", err);
    return NextResponse.json({ error: "Failed to initialize upload session" }, { status: 500 });
  }
}
