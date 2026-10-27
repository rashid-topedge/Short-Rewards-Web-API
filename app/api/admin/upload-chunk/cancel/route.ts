import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { FolderType, b2CancelLargeFile } from "@/lib/b2";
import { deleteUploadSession, getUploadSession } from "@/lib/db";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const session = await getUploadSession(sessionId);
    if (session) {
      if (session.status === "completing") {
        return NextResponse.json({ error: "Upload is being finalized and can't be cancelled" }, { status: 409 });
      }
      if (session.b2FileId) {
        // Discards the uploaded parts so they don't keep costing storage.
        await b2CancelLargeFile(session.folderType as FolderType, session.b2FileId).catch((err) =>
          console.warn("B2 cancelLargeFile failed:", err)
        );
      }
      await deleteUploadSession(sessionId);
    }

    return NextResponse.json({ success: true, message: "Upload session cancelled and cleaned up" });
  } catch (err: unknown) {
    console.error("Cancel upload error:", err);
    return NextResponse.json({ error: "Failed to cancel upload session" }, { status: 500 });
  }
}
