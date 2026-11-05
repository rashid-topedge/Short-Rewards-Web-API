import { NextRequest, NextResponse, after } from "next/server";
import {
  decrementReelLikes,
  getReel,
  getRewardConfig,
  hasClaimedReel,
  incrementReelLikes,
  likedReelIds,
  setUserReelLike,
} from "@/lib/db";
import { flushReelViews, recordReelView, reelViewsFlushDue } from "@/lib/viewCounter";
import { getUrlSigner } from "@/lib/b2";
import { reelCoinsForDuration } from "@/lib/rewardConfig";
import { authError, optionalUser } from "@/lib/userAuth";

/**
 * GET /api/reels/:id → the reel with signed links and `rewardCoins`.
 * With `Authorization: Bearer <accessToken>` also `rewardClaimed` and `liked`.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reelId: string }> }
) {
  const { reelId } = await params;
  const id = parseInt(reelId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid reel ID" }, { status: 400 });
  }
  const who = optionalUser(req);
  if (who === "expired") return authError(401, "TOKEN_EXPIRED", "Access token expired; refresh it");
  const userId = who?.userId;

  try {
    const [reel, rewards] = await Promise.all([getReel(id), getRewardConfig()]);
    if (!reel) {
      return NextResponse.json({ error: "Reel not found" }, { status: 404 });
    }

    const [sign, claimed, liked] = await Promise.all([
      getUrlSigner("reels", [reel.videoUrl, reel.thumbnailUrl || ""]),
      userId ? hasClaimedReel(userId, id) : Promise.resolve(undefined),
      userId ? likedReelIds(userId, [id]) : Promise.resolve(null),
    ]);

    // Views are counted in memory and written in batches (see lib/viewCounter.ts).
    recordReelView(id);
    if (reelViewsFlushDue()) after(() => flushReelViews());

    return NextResponse.json(
      {
        ...reel,
        videoUrl: sign(reel.videoUrl),
        thumbnailUrl: reel.thumbnailUrl ? sign(reel.thumbnailUrl) : reel.thumbnailUrl,
        rewardCoins: reelCoinsForDuration(rewards.reel, reel.durationSeconds),
        ...(userId ? { rewardClaimed: Boolean(claimed), liked: Boolean(liked?.has(id)) } : {}),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    console.error("Failed to load reel:", err);
    return NextResponse.json({ error: "Failed to load reel" }, { status: 500 });
  }
}

/**
 * POST /api/reels/:id { action: "view" | "like" | "unlike" }
 *
 * Signed in (Bearer token): a like counts once per user; liking again or
 * unliking a reel that isn't liked changes nothing. Returns `{ liked, likeCount }`.
 * Without a token (old app builds) the count just goes up/down as before.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reelId: string }> }
) {
  const { reelId } = await params;
  const id = parseInt(reelId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid reel ID" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Feed views from the app (the reel detail GET above counts its own view).
    // Batched in memory like GET; no database write per view.
    if (body?.action === "view") {
      recordReelView(id);
      if (reelViewsFlushDue()) after(() => flushReelViews());
      return NextResponse.json({ success: true, message: "View recorded" });
    }

    if (body?.action !== "like" && body?.action !== "unlike") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    const like = body.action === "like";

    const who = optionalUser(req);
    if (who === "expired") return authError(401, "TOKEN_EXPIRED", "Access token expired; refresh it");
    if (who) {
      const result = await setUserReelLike(who.userId, id, like);
      if (!result) return NextResponse.json({ error: "Reel not found" }, { status: 404 });
      return NextResponse.json({
        success: true,
        message: like ? "Reel liked" : "Like removed",
        reelId: id,
        ...result,
      });
    }

    // Legacy (no token): not tied to a user.
    if (!like) {
      await decrementReelLikes(id);
      return NextResponse.json({ success: true, message: "Like removed" });
    }
    await incrementReelLikes(id);
    const reel = await getReel(id);
    const sign = await getUrlSigner("reels", reel ? [reel.videoUrl] : []);
    return NextResponse.json({
      success: true,
      message: "Reel liked",
      reel: reel ? { ...reel, videoUrl: sign(reel.videoUrl) } : null,
    });
  } catch {
    return NextResponse.json({ error: "Failed to process reel action" }, { status: 500 });
  }
}
