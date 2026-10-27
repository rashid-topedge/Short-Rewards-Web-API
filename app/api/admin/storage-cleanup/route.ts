import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { getB2DeleteQueueStats } from "@/lib/db";
import { processB2DeleteQueue, queueOrphanedFiles, scanOrphanedFiles } from "@/lib/b2Cleanup";

export const maxDuration = 300;

/**
 * Admin storage cleanup for Backblaze (reels/ and dramas/ only — payout
 * receipts are never touched).
 *
 * GET                                  → queue status
 * POST { action: "process" }           → delete queued files now
 * POST { action: "scan" }              → dry run: files no reel/episode/drama uses (older than 24h)
 * POST { action: "delete-orphans" }    → queue those files and start deleting them
 */
export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getB2DeleteQueueStats());
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const minAgeHours = Math.max(1, Number(body?.minAgeHours) || 24);

    if (body?.action === "process") {
      const result = await processB2DeleteQueue({ limit: 200, timeBudgetMs: 240_000 });
      return NextResponse.json({ ...result, queue: await getB2DeleteQueueStats() });
    }

    if (body?.action === "scan") {
      const scan = await scanOrphanedFiles(minAgeHours);
      return NextResponse.json({ minAgeHours, folders: scan.folders });
    }

    if (body?.action === "delete-orphans") {
      const queued = await queueOrphanedFiles(minAgeHours);
      const result = await processB2DeleteQueue({ limit: 200, timeBudgetMs: 240_000 });
      return NextResponse.json({ queued, ...result, queue: await getB2DeleteQueueStats() });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Storage cleanup failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Storage cleanup failed: ${message}` }, { status: 500 });
  }
}
