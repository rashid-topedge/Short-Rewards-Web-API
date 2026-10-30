import { NextRequest, NextResponse } from "next/server";
import { getRewardConfig, listReels } from "@/lib/db";
import { getUrlSigner } from "@/lib/b2";
import { reelCoinsForDuration } from "@/lib/rewardConfig";
import { authError, optionalUser } from "@/lib/userAuth";

/**
 * GET /api/reels?sort=newest|trending|random&limit=&cursor=&dramaId=
 *
 * Works without sign-in. With `Authorization: Bearer <accessToken>`, reels the
 * user hasn't earned coins for come first, then the rest (each item has
 * `rewardClaimed`). Add `personal=0` to get the plain feed while signed in.
 * Every item has `rewardCoins`: what it pays by length (with a watch token).
 * Pass `nextCursor` back unchanged; it carries which part of the feed you're in.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") || undefined;
  const limit = parseInt(searchParams.get("limit") || "10", 10);
  const dramaIdParam = searchParams.get("dramaId");
  const dramaId = dramaIdParam ? parseInt(dramaIdParam, 10) : undefined;
  const sortParam = searchParams.get("sort");
  const sort = sortParam === "trending" || sortParam === "random" ? sortParam : "newest";

  const who = searchParams.get("personal") === "0" ? null : optionalUser(req);
  if (who === "expired") return authError(401, "TOKEN_EXPIRED", "Access token expired; refresh it");
  const userId = who?.userId;

  try {
    const [data, rewards] = await Promise.all([
      listReels({
        cursor,
        limit: Number.isFinite(limit) ? limit : 10,
        dramaId: dramaId !== undefined && !isNaN(dramaId) ? dramaId : undefined,
        sort,
        userId,
      }),
      getRewardConfig(),
    ]);
    const sign = await getUrlSigner(
      "reels",
      data.items.flatMap((r) => [r.videoUrl, r.thumbnailUrl || ""])
    );

    return NextResponse.json(
      {
        ...data,
        personalized: Boolean(userId),
        items: data.items.map((reel) => ({
          ...reel,
          videoUrl: sign(reel.videoUrl),
          thumbnailUrl: reel.thumbnailUrl ? sign(reel.thumbnailUrl) : reel.thumbnailUrl,
          rewardCoins: reelCoinsForDuration(rewards.reel, reel.durationSeconds),
        })),
      },
      // Per-user order (and short-lived signed links): never cache in shared caches.
      { headers: { "Cache-Control": userId ? "private, no-store" : "private, max-age=0" } }
    );
  } catch (err) {
    console.error("Failed to list reels:", err);
    return NextResponse.json({ error: "Failed to load reels" }, { status: 500 });
  }
}
