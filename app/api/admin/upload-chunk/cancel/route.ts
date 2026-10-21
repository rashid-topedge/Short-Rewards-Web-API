import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import fs from "fs";
import path from "path";

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

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    return NextResponse.json({ success: true, message: "Upload session cancelled and cleaned up" });
  } catch (err: unknown) {
    console.error("Cancel upload error:", err);
    return NextResponse.json({ error: "Failed to cancel upload session" }, { status: 500 });
  }
}
