import { NextRequest, NextResponse } from "next/server";
import { requireStaff, type StaffSession } from "@/lib/auth";
import { canUploadTo } from "@/lib/reelPermissions";
import { FolderType, b2UploadPart, uploadBufferToB2 } from "@/lib/b2";
import { getUploadSession, recordUploadPart } from "@/lib/db";

export const maxDuration = 300;

/**
 * Two ways to add a chunk:
 * - multipart form with the bytes: forwarded straight to B2 (never touches disk);
 * - JSON { sessionId, chunkIndex, sha1 } after the browser uploaded the chunk
 *   directly to B2: just records it (B2 verifies the SHA-1s when the file is finished).
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const staff = auth.session;

  if ((req.headers.get("content-type") || "").includes("application/json")) {
    return recordDirectPart(req, staff);
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
    if (!canUploadTo(staff, session.folderType)) {
      return NextResponse.json({ error: "Moderators can only upload reels." }, { status: 403 });
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

async function recordDirectPart(req: NextRequest, staff: StaffSession) {
  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const chunkIndex = Number(body?.chunkIndex);
  const sha1 = typeof body?.sha1 === "string" ? body.sha1.toLowerCase() : "";

  const session = sessionId ? await getUploadSession(sessionId) : null;
  if (!session) return NextResponse.json({ error: "Upload session not found or expired" }, { status: 404 });
  if (!canUploadTo(staff, session.folderType)) {
    return NextResponse.json({ error: "Moderators can only upload reels." }, { status: 403 });
  }
  if (session.status !== "uploading") {
    return NextResponse.json({ error: `Upload session is ${session.status}` }, { status: 409 });
  }
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= session.totalChunks) {
    return NextResponse.json({ error: "chunkIndex out of range" }, { status: 400 });
  }
  if (session.b2FileId && !/^[0-9a-f]{40}$/.test(sha1)) {
    return NextResponse.json({ error: "A SHA-1 is required for each part" }, { status: 400 });
  }

  // Single-part files are checked in storage when the upload is completed.
  const uploadedChunks = await recordUploadPart(sessionId, chunkIndex, session.b2FileId ? sha1 : "direct");
  return NextResponse.json({
    success: true,
    chunkIndex,
    uploadedCount: uploadedChunks.length,
    totalChunks: session.totalChunks,
    uploadedChunks,
  });
}
