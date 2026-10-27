import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { FolderType, b2UploadPart, uploadBufferToB2 } from "@/lib/b2";
import { getUploadSession, recordUploadPart } from "@/lib/db";

export const maxDuration = 300;

/** Receives one chunk and forwards it straight to B2 (never touches local disk). */
export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const sessionId = formData.get("sessionId");
    const chunkIndexStr = formData.get("chunkIndex");
    const chunkFile = formData.get("chunk");

    if (typeof sessionId !== "string" || typeof chunkIndexStr !== "string" || !(chunkFile instanceof Blob)) {
      return NextResponse.json({ error: "Missing sessionId, chunkIndex, or chunk payload" }, { status: 400 });
    }

    const session = await getUploadSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Upload session not found or expired" }, { status: 404 });
    }
    if (session.status !== "uploading") {
      return NextResponse.json({ error: `Upload session is ${session.status}` }, { status: 409 });
    }

    const chunkIndex = parseInt(chunkIndexStr, 10);
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      return NextResponse.json({ error: "chunkIndex out of range" }, { status: 400 });
    }

    const isLast = chunkIndex === session.totalChunks - 1;
    const expectedSize = isLast ? session.fileSize - session.chunkSize * chunkIndex : session.chunkSize;
    if (chunkFile.size !== expectedSize) {
      return NextResponse.json(
        { error: `Chunk ${chunkIndex} should be ${expectedSize} bytes, got ${chunkFile.size}` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await chunkFile.arrayBuffer());
    const folderType = session.folderType as FolderType;

    let sha1: string;
    if (session.b2FileId) {
      sha1 = await b2UploadPart(folderType, session.b2FileId, chunkIndex + 1, buffer);
    } else {
      // Single-chunk file: upload it as a normal B2 file right away.
      await uploadBufferToB2({ folderType, b2FileName: session.b2FileName, buffer, mimeType: session.mimeType });
      sha1 = "single";
    }

    const uploadedChunks = await recordUploadPart(sessionId, chunkIndex, sha1);

    return NextResponse.json({
      success: true,
      chunkIndex,
      uploadedCount: uploadedChunks.length,
      totalChunks: session.totalChunks,
      uploadedChunks,
    });
  } catch (err: unknown) {
    console.error("Chunk part upload error:", err);
    return NextResponse.json({ error: "Failed to save upload chunk" }, { status: 500 });
  }
}
