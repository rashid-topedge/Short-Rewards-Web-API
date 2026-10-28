import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireStaff } from "@/lib/auth";
import { canUploadTo } from "@/lib/reelPermissions";
import { B2_MIN_PART_BYTES, FolderType, b2StartLargeFile, getB2ConfigForFolder } from "@/lib/b2";
import { createUploadSession } from "@/lib/db";

const FOLDER_TYPES: FolderType[] = ["dramas", "reels", "payouts"];
const MAX_CHUNK_BYTES = 50 * 1024 * 1024;
const MAX_CHUNKS = 10_000; // B2 large-file part limit

/**
 * Starts a chunked upload. Nothing is written to local disk: each chunk is sent
 * straight to Backblaze B2 as one part of a "large file", and the session state
 * is kept in the database so any server instance can take any request.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const staff = auth.session;

  try {
    const body = await req.json();
    const fileName = typeof body?.fileName === "string" ? body.fileName : "";
    const fileSize = Number(body?.fileSize);
    const folderType = body?.folderType as FolderType;
    const totalChunks = Number(body?.totalChunks);
    const chunkSize = Number(body?.chunkSize) || 5 * 1024 * 1024;
    const mimeType = typeof body?.mimeType === "string" && body.mimeType ? body.mimeType : "application/octet-stream";
    const targetName = typeof body?.targetName === "string" && body.targetName ? body.targetName : `item_${Date.now()}`;
    // uniqueName: prefix the stored file name so two uploads called "clip.mp4"
    // never overwrite each other (used by the reel uploader).
    // Moderators always get a unique name, so an upload can never replace the
    // file behind a reel that is already live.
    const uniqueName = body?.uniqueName === true || staff.role === "moderator";

    if (!fileName || !(fileSize > 0) || !FOLDER_TYPES.includes(folderType) || !Number.isInteger(totalChunks) || totalChunks < 1) {
      return NextResponse.json({ error: "Missing required initialization fields" }, { status: 400 });
    }
    if (!canUploadTo(staff, folderType)) {
      return NextResponse.json({ error: "Moderators can only upload reels." }, { status: 403 });
    }
    if (totalChunks > MAX_CHUNKS || chunkSize > MAX_CHUNK_BYTES) {
      return NextResponse.json({ error: "File too large or chunk size too big" }, { status: 400 });
    }
    if (totalChunks > 1 && chunkSize < B2_MIN_PART_BYTES) {
      return NextResponse.json(
        { error: `Chunk size must be at least ${B2_MIN_PART_BYTES} bytes for multi-chunk uploads` },
        { status: 400 }
      );
    }
    if (Math.ceil(fileSize / chunkSize) !== totalChunks) {
      return NextResponse.json({ error: "totalChunks does not match fileSize / chunkSize" }, { status: 400 });
    }

    const b2Config = await getB2ConfigForFolder(folderType);
    if (!b2Config) {
      return NextResponse.json(
        { error: `Backblaze B2 is not configured for folder type: ${folderType}` },
        { status: 400 }
      );
    }

    const baseFilename = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const sanitizedFilename = uniqueName
      ? `${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}_${baseFilename}`
      : baseFilename;
    const sanitizedTarget = targetName.replace(/[^a-zA-Z0-9._-]/g, "_");
    // Reels are stored flat in a single folder with no nested subfolder.
    const b2FileName =
      folderType === "reels"
        ? `${folderType}/${sanitizedFilename}`
        : `${folderType}/${sanitizedTarget}/${sanitizedFilename}`;

    // Single-chunk files are uploaded in one request; only multi-chunk files need a B2 large file.
    const b2FileId = totalChunks > 1 ? await b2StartLargeFile(folderType, b2FileName, mimeType) : null;

    const sessionId = `up_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    await createUploadSession({
      sessionId,
      fileName,
      folderType,
      targetName,
      b2FileName,
      b2FileId,
      mimeType,
      fileSize,
      totalChunks,
      chunkSize,
    });

    return NextResponse.json({
      success: true,
      sessionId,
      chunkSize,
      totalChunks,
      uploadedChunks: [],
      isB2Configured: true,
      targetBucketId: b2Config.bucketId,
    });
  } catch (err: unknown) {
    console.error("Upload session init error:", err);
    return NextResponse.json({ error: "Failed to initialize upload session" }, { status: 500 });
  }
}
