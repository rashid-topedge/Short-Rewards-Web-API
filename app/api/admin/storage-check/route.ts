import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { runStorageCheck } from "@/lib/storageCheck";
import type { FolderType } from "@/lib/b2";

export const maxDuration = 60;

/**
 * POST /api/admin/storage-check { folderType: "dramas" | "reels" | "payouts" }
 * Admin only. Tests the saved Backblaze settings end to end (upload, signed
 * link, download, privacy, direct uploads, delete) and reports each step.
 */
export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { folderType?: string };
  const folderType = body.folderType as FolderType;
  if (!["dramas", "reels", "payouts"].includes(folderType)) {
    return NextResponse.json({ error: "folderType must be dramas, reels or payouts" }, { status: 400 });
  }
  return NextResponse.json(await runStorageCheck(folderType));
}
