import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { canUploadTo } from "@/lib/reelPermissions";
import { FolderType, b2FinishLargeFile, b2PublicUrl, getUrlSigner } from "@/lib/b2";
import {
  createReelAdmin,
  deleteUploadSession,
  getUploadPartSha1s,
  getUploadSession,
  transitionUploadSession,
} from "@/lib/db";
import { getVideoDurationFromUrl } from "@/lib/video";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const staff = auth.session;

  let sessionId = "";
  let claimed = false;
  try {
    const body = await req.json();
    sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
    // Old clients rely on reels being auto-created here; the reel uploader sends
    // createReel: false and saves the reel itself with the admin's title/description.
    // Moderators save the reel themselves (as a draft or for approval).
    const createReel = body?.createReel !== false && staff.role === "admin";
    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const session = await getUploadSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
    }
    if (!canUploadTo(staff, session.folderType)) {
      return NextResponse.json({ error: "Moderators can only upload reels." }, { status: 403 });
    }

    const parts = await getUploadPartSha1s(sessionId);
    const have = new Set(parts.map((p) => p.chunkIndex));
    const missingChunks: number[] = [];
    for (let i = 0; i < session.totalChunks; i++) if (!have.has(i)) missingChunks.push(i);
    if (missingChunks.length > 0) {
      return NextResponse.json({ error: "Cannot complete upload: missing chunks", missingChunks }, { status: 400 });
    }

    // Only one request may finish a session.
    claimed = await transitionUploadSession(sessionId, "uploading", "completing");
    if (!claimed) {
      return NextResponse.json({ error: `Upload session is already ${session.status}` }, { status: 409 });
    }

    const folderType = session.folderType as FolderType;
    if (session.b2FileId) {
      await b2FinishLargeFile(folderType, session.b2FileId, parts.map((p) => p.sha1));
    }
    const finalUrl = await b2PublicUrl(folderType, session.b2FileName);

    let durationSeconds: number | null = null;
    if (folderType === "reels" && session.mimeType.startsWith("video/")) {
      const sign = await getUrlSigner("reels", [finalUrl]);
      durationSeconds = await getVideoDurationFromUrl(sign(finalUrl));
    }

    if (folderType === "reels" && createReel) {
      try {
        const sanitizedFilename = session.b2FileName.slice(session.b2FileName.lastIndexOf("/") + 1);
        await createReelAdmin({
          title: sanitizedFilename.replace(/\.[^.]+$/, "").replace(/_/g, " "),
          videoUrl: finalUrl,
          durationSeconds: durationSeconds ?? 0,
          synopsis: `Uploaded via chunked upload (${folderType})`,
          isPublished: true,
        });
      } catch (dbErr) {
        console.warn("Failed to create reel DB entry after upload:", dbErr);
      }
    }

    await deleteUploadSession(sessionId);

    return NextResponse.json({
      success: true,
      url: finalUrl,
      durationSeconds,
      fileName: session.fileName,
      storage: "b2",
      message: `Successfully uploaded to Backblaze B2 (${folderType})`,
    });
  } catch (err: unknown) {
    console.error("Complete chunk upload error:", err);
    if (claimed) {
      // Let the client retry the completion.
      await transitionUploadSession(sessionId, "completing", "uploading").catch(() => {});
    }
    return NextResponse.json({ error: "Failed to complete upload" }, { status: 500 });
  }
}
