import {
  completeB2Delete,
  enqueueB2FileNames,
  failB2Delete,
  getDueB2Deletes,
  isMediaFileStillUsed,
  listReferencedMediaUrls,
  type MediaFolder,
} from "@/lib/db";
import { b2DeleteFile, b2FileNameFromUrl, b2ListFiles, getB2ConfigForFolder, resolveOwnedFileName } from "@/lib/b2";

/**
 * Background removal of Backblaze files that no reel / episode / drama uses any
 * more. Called right after delete requests (via next/server `after`) and from the
 * admin Storage cleanup panel. Safe to run concurrently or repeatedly.
 * Payout receipts are never touched.
 */
export async function processB2DeleteQueue(
  options: { limit?: number; timeBudgetMs?: number } = {}
): Promise<{ deleted: number; keptInUse: number; skippedExternal: number; failed: number; remaining: boolean }> {
  const limit = options.limit ?? 50;
  const deadline = Date.now() + (options.timeBudgetMs ?? 25_000);
  const stats = { deleted: 0, keptInUse: 0, skippedExternal: 0, failed: 0, remaining: false };

  const jobs = await getDueB2Deletes(limit);
  for (const job of jobs) {
    if (Date.now() > deadline) {
      stats.remaining = true;
      break;
    }
    try {
      const fileName = job.fileName ?? (job.fileUrl ? await resolveOwnedFileName(job.folderType, job.fileUrl) : null);
      if (!fileName) {
        // Not one of our B2 files (external link or another bucket): nothing to delete.
        stats.skippedExternal++;
        await completeB2Delete(job.id);
        continue;
      }
      if (await isMediaFileStillUsed(job.fileUrl, fileName)) {
        stats.keptInUse++;
        await completeB2Delete(job.id);
        continue;
      }
      await b2DeleteFile(job.folderType, fileName);
      stats.deleted++;
      await completeB2Delete(job.id);
    } catch (err) {
      stats.failed++;
      await failB2Delete(job.id, job.attempts, err instanceof Error ? err.message : String(err)).catch(() => {});
    }
  }
  if (jobs.length === limit) stats.remaining = true;
  return stats;
}

export type OrphanScanResult = {
  folders: {
    folderType: MediaFolder;
    prefix: string;
    scanned: number;
    orphanCount: number;
    orphanBytes: number;
    sample: string[];
  }[];
  orphanFileNames: Record<MediaFolder, string[]>;
};

/**
 * Finds files under reels/ and dramas/ that no database row references.
 * Files newer than `minAgeHours` are ignored, so videos uploaded but not yet
 * saved as reels are never picked up.
 */
export async function scanOrphanedFiles(minAgeHours = 24): Promise<OrphanScanResult> {
  const cutoff = Date.now() - minAgeHours * 60 * 60 * 1000;
  const used = new Set<string>();
  for (const url of await listReferencedMediaUrls()) {
    used.add(url.split("?")[0]);
    const name = b2FileNameFromUrl(url);
    if (name) used.add(`name:${decodeURIComponent(name)}`);
  }

  const result: OrphanScanResult = { folders: [], orphanFileNames: { reels: [], dramas: [] } };
  for (const folderType of ["reels", "dramas"] as MediaFolder[]) {
    const config = await getB2ConfigForFolder(folderType);
    if (!config) continue;
    const prefix = `${folderType}/`;
    const files = await b2ListFiles(folderType, prefix);
    const orphans = files.filter((f) => {
      if (f.uploadedAt > cutoff) return false;
      if (used.has(`name:${f.fileName}`)) return false;
      if (config.publicUrl && used.has(`${config.publicUrl.replace(/\/$/, "")}/${f.fileName}`)) return false;
      return true;
    });
    result.orphanFileNames[folderType] = orphans.map((f) => f.fileName);
    result.folders.push({
      folderType,
      prefix,
      scanned: files.length,
      orphanCount: orphans.length,
      orphanBytes: orphans.reduce((n, f) => n + (f.size || 0), 0),
      sample: orphans.slice(0, 20).map((f) => f.fileName),
    });
  }
  return result;
}

/** Re-scans and queues every orphan for deletion. Returns how many were queued. */
export async function queueOrphanedFiles(minAgeHours = 24): Promise<number> {
  const scan = await scanOrphanedFiles(minAgeHours);
  let queued = 0;
  for (const folderType of ["reels", "dramas"] as MediaFolder[]) {
    queued += await enqueueB2FileNames(folderType, scan.orphanFileNames[folderType]);
  }
  return queued;
}
