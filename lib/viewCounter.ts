import { addReelViews } from "@/lib/db";

/**
 * Buffers reel view counts in memory and writes them in batches, instead of one
 * UPDATE per view. A flush happens when FLUSH_EVERY_MS has passed since the last
 * one or when MAX_PENDING distinct reels are waiting, whichever comes first.
 *
 * Trade-offs: counts can lag by up to ~10 seconds, and on a restart at most the
 * views since the last flush (~10 s worth) are lost. That's acceptable for a
 * popularity counter, and far cheaper than one database write per view.
 */

const FLUSH_EVERY_MS = 10_000;
const MAX_PENDING = 500;

let pending = new Map<number, number>();
let lastFlush = Date.now();
let flushing: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function recordReelView(reelId: number): void {
  pending.set(reelId, (pending.get(reelId) ?? 0) + 1);
  if (pending.size >= MAX_PENDING) {
    void flushReelViews();
  } else if (!timer) {
    timer = setTimeout(() => void flushReelViews(), FLUSH_EVERY_MS);
    // Don't keep the process alive just for this timer.
    (timer as { unref?: () => void }).unref?.();
  }
}

/** True when a flush is due; call flushReelViews() (e.g. from `after`) in that case. */
export function reelViewsFlushDue(): boolean {
  return pending.size > 0 && (pending.size >= MAX_PENDING || Date.now() - lastFlush >= FLUSH_EVERY_MS);
}

export async function flushReelViews(): Promise<void> {
  if (flushing) return flushing;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (pending.size === 0) return;

  const batch = pending;
  pending = new Map();
  lastFlush = Date.now();
  flushing = addReelViews(batch)
    .catch((err) => {
      // Put the counts back so they're retried with the next flush.
      for (const [id, n] of batch) pending.set(id, (pending.get(id) ?? 0) + n);
      console.error("Failed to flush reel views:", err);
    })
    .finally(() => {
      flushing = null;
    });
  return flushing;
}
