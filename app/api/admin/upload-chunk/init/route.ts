import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireStaff } from "@/lib/auth";
import { canManageOwned, canUploadTo } from "@/lib/reelPermissions";
import { B2_MIN_PART_BYTES, FolderType, b2FileExists, b2StartLargeFile, getB2ConfigForFolder } from "@/lib/b2";
import { claimUploadSession, deleteUploadSession, ensureDramaStorageFolder, getDramaOwnerInfo, setUploadSessionFileId } from "@/lib/db";
import { claimFreeName, cleanFileName, dramaFolderName } from "@/lib/uploadNames";
import { ensureDirectUploads } from "@/lib/b2Direct";

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
    let targetName = typeof body?.targetName === "string" && body.targetName ? body.targetName : `item_${Date.now()}`;
    // Files keep their own name ("My Clip.mp4" → "My-Clip.mp4"); if that name
    // is already used in the folder (in B2 or by an upload in progress) it
    // becomes "My-Clip-2.mp4", so an upload never replaces an existing file.
    // (`uniqueName` from older clients is no longer needed.)
    const dramaId = Number(body?.dramaId);

    if (!fileName || !(fileSize > 0) || !FOLDER_TYPES.includes(folderType) || !Number.isInteger(totalChunks) || totalChunks < 1) {
      return NextResponse.json({ error: "Missing required initialization fields" }, { status: 400 });
    }
    if (!canUploadTo(staff, folderType)) {
      return NextResponse.json(
        { error: folderType === "payouts" ? "Only the admin and lead moderators can upload payout receipts." : "Moderators can only upload reels and drama files." },
        { status: 403 }
      );
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

    // Episodes and covers of an existing drama go to that drama's own folder,
    // "dramas/<id>-<title>", which is fixed the first time it's used.
    if (folderType === "dramas" && Number.isInteger(dramaId) && dramaId > 0) {
      const drama = await getDramaOwnerInfo(dramaId);
      if (!drama) return NextResponse.json({ error: "Drama not found" }, { status: 404 });
      if (!canManageOwned(staff, drama.createdById)) {
        return NextResponse.json({ error: "You can only upload to dramas you created." }, { status: 403 });
      }
      targetName =
        drama.storageFolder || (await ensureDramaStorageFolder(dramaId, dramaFolderName(dramaId, drama.title))) || String(dramaId);
    }

    const cleanName = cleanFileName(fileName, mimeType.startsWith("video/") ? "video" : "file");
    const folderName = targetName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[-.]+/, "").slice(0, 100) || "files";
    // Reels are stored flat in a single folder with no nested subfolder.
    const dir = folderType === "reels" ? folderType : `${folderType}/${folderName}`;

    const sessionId = `up_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const b2FileName = await claimFreeName(dir, cleanName, async (candidate) => {
      if (await b2FileExists(folderType, candidate)) return false;
      return claimUploadSession({
        sessionId,
        fileName,
        folderType,
        targetName: folderName,
        b2FileName: candidate,
        b2FileId: null,
        mimeType,
        fileSize,
        totalChunks,
        chunkSize,
      });
    });

    // Single-chunk files are uploaded in one request; only multi-chunk files need a B2 large file.
    if (totalChunks > 1) {
      try {
        await setUploadSessionFileId(sessionId, await b2StartLargeFile(folderType, b2FileName, mimeType));
      } catch (err) {
        await deleteUploadSession(sessionId).catch(() => {});
        throw err;
      }
    }

    // Browsers send the bytes straight to Backblaze when the bucket allows it
    // (hosts like Vercel reject request bodies over 4.5 MB).
    const direct = await ensureDirectUploads(folderType);

    return NextResponse.json({
      success: true,
      uploadMode: direct.ok ? "direct" : "server",
      directProblem: direct.ok ? null : direct.reason,
      sessionId,
      chunkSize,
      totalChunks,
      uploadedChunks: [],
      isB2Configured: true,
      targetBucketId: b2Config.bucketId,
      /** Where the file will be stored, e.g. "reels/My-Clip.mp4" or "reels/My-Clip-2.mp4". */
      storedAs: b2FileName,
    });
  } catch (err: unknown) {
    console.error("Upload session init error:", err);
    return NextResponse.json({ error: "Failed to initialize upload session" }, { status: 500 });
  }
}
