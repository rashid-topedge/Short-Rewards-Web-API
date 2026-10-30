import crypto from "node:crypto";

/**
 * Signed "I started watching this reel at time T" tokens. The app gets one
 * from POST /api/user/reward/reel/start when a reel starts playing and sends
 * it back with the claim; the claim only pays after enough of the reel's
 * length has passed. Stateless (HMAC), so it adds no database writes.
 */

const MAX_AGE_MS = 6 * 60 * 60 * 1000;

function key(): Buffer {
  const secret = process.env.USER_TOKEN_SECRET;
  if (!secret || secret.length < 32) throw new Error("USER_TOKEN_SECRET is not set (or shorter than 32 characters).");
  return crypto.createHmac("sha256", secret).update("short-reward:watch-token").digest();
}

export function createWatchToken(userId: string, reelId: number, startedAt = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, r: reelId, t: startedAt })).toString("base64url");
  const sig = crypto.createHmac("sha256", key()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export type WatchTokenCheck =
  | { ok: true; startedAt: number }
  | { ok: false; reason: "invalid" | "expired" | "wrong_reel" };

export function readWatchToken(token: unknown, userId: string, reelId: number, now = Date.now()): WatchTokenCheck {
  if (typeof token !== "string" || token.length > 512) return { ok: false, reason: "invalid" };
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return { ok: false, reason: "invalid" };
  const expected = crypto.createHmac("sha256", key()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: unknown; r?: unknown; t?: unknown };
    if (data.u !== userId || data.r !== reelId) return { ok: false, reason: "wrong_reel" };
    if (typeof data.t !== "number" || data.t > now + 60_000) return { ok: false, reason: "invalid" };
    if (now - data.t > MAX_AGE_MS) return { ok: false, reason: "expired" };
    return { ok: true, startedAt: data.t };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
