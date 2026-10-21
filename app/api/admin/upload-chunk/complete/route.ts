import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { FolderType, getB2ConfigForFolder, uploadBufferToB2 } from "@/lib/b2";
import { createReelAdmin } from "@/lib/db";
import { getVideoDuration } from "@/lib/video";
import fs from "fs";
import path from "path";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
    const tempDir = path.resolve(process.cwd(), "public", "uploads", ".temp-chunks", sanitizedSessionId);
    const sessionPath = path.join(tempDir, "session.json");

    if (!fs.existsSync(sessionPath)) {
      return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
    }

    const sessionData = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
    const { fileName, folderType, targetName, totalChunks, mimeType } = sessionData;

    // Verify all chunks exist
    const missingChunks: number[] = [];
    const chunkBuffers: Buffer[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(tempDir, `chunk_${i}.part`);
      if (!fs.existsSync(partPath)) {
        missingChunks.push(i);
      } else {
        chunkBuffers.push(fs.readFileSync(partPath));
      }
    }

    if (missingChunks.length > 0) {
      return NextResponse.json({
        error: "Cannot complete upload: missing chunks",
        missingChunks,
      }, { status: 400 });
    }

    // Assemble file buffer
    const assembledBuffer = Buffer.concat(chunkBuffers);
    const sanitizedFilename = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const sanitizedTarget = String(targetName).replace(/[^a-zA-Z0-9._-]/g, "_");
    // Reels are stored flat in a single folder with no nested subfolder.
    const isFlat = folderType === "reels";
    const b2FileName = isFlat
      ? `${folderType}/${sanitizedFilename}`
      : `${folderType}/${sanitizedTarget}/${sanitizedFilename}`;

    const b2Config = await getB2ConfigForFolder(folderType as FolderType);
    if (!b2Config) {
      return NextResponse.json({ error: `Backblaze B2 is not configured for folder type: ${folderType}` }, { status: 400 });
    }

    const b2Result = await uploadBufferToB2({
      folderType: folderType as FolderType,
      b2FileName,
      buffer: assembledBuffer,
      mimeType,
    });
    const finalUrl = b2Result.url;
    const storageUsed = "b2";

    // If folderType is reels, also create a DB entry
    if (folderType === "reels" && finalUrl) {
      try {
        const durationSeconds = (await getVideoDuration(assembledBuffer)) ?? 0;
        await createReelAdmin({
          title: sanitizedFilename.replace(/\.[^.]+$/, "").replace(/_/g, " "),
          videoUrl: finalUrl,
          durationSeconds,
          synopsis: `Uploaded via chunked upload (${folderType})`,
          isPublished: true,
        });
      } catch (dbErr) {
        console.warn("Failed to create reel DB entry after upload:", dbErr);
      }
    }

    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn("Failed to remove temp chunk directory:", cleanupErr);
    }

    return NextResponse.json({
      success: true,
      url: finalUrl,
      fileName,
      storage: storageUsed,
      message: `Successfully uploaded to Backblaze B2 (${folderType})`,
    });
  } catch (err: unknown) {
    console.error("Complete chunk upload error:", err);
    return NextResponse.json({ error: "Failed to assemble and complete upload" }, { status: 500 });
  }
}
