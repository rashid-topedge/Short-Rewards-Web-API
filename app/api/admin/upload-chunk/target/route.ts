import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { canUploadTo } from "@/lib/reelPermissions";
import type { FolderType } from "@/lib/b2";
import { directPartTarget, directPutTarget, ensureDirectUploads } from "@/lib/b2Direct";
import { getUploadSession } from "@/lib/db";

/**
 * POST /api/admin/upload-chunk/target  { sessionId }
 * Where the browser should send this session's bytes directly:
 * - { kind: "b2-part", uploadUrl, authorizationToken } for multi-part files
 *   (reuse it for each part in order; ask again if Backblaze returns 401/503);
 * - { kind: "s3-put", url } for single-part files (valid for an hour).
 * Both only work for this one file.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const session = sessionId ? await getUploadSession(sessionId) : null;
  if (!session) return NextResponse.json({ error: "Upload session not found or expired" }, { status: 404 });
  if (!canUploadTo(auth.session, session.folderType)) {
    return NextResponse.json({ error: "Moderators can only upload reels." }, { status: 403 });
  }
  if (session.status !== "uploading") {
    return NextResponse.json({ error: `Upload session is ${session.status}` }, { status: 409 });
  }

  const folderType = session.folderType as FolderType;
  const ready = await ensureDirectUploads(folderType);
  if (!ready.ok) return NextResponse.json({ error: ready.reason, code: "DIRECT_UNAVAILABLE" }, { status: 409 });

  try {
    const target = session.b2FileId
      ? await directPartTarget(folderType, session.b2FileId)
      : await directPutTarget(folderType, session.b2FileName);
    return NextResponse.json(target, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Direct upload target error:", err);
    return NextResponse.json({ error: "Couldn't prepare the upload. Please try again." }, { status: 500 });
  }
}
