import { NextRequest } from "next/server";
import { claimedEpisodeNumbers, getDrama, getRewardConfig, listEpisodes } from "@/lib/db";
import { signEpisodes } from "@/lib/dramaMedia";
import { authError, optionalUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/dramas/:id/episodes
 *
 * Each episode: ep, title, playUrl, thumbnailUrl, durationSeconds (links signed
 * for the private bucket) and `rewardCoins`. With `Authorization: Bearer
 * <accessToken>` each also has `rewardClaimed`.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ dramaId: string }> },
) {
  const { dramaId } = await context.params;
  const id = Number(dramaId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Invalid drama id" }, { status: 400 });
  }
  const who = optionalUser(request);
  if (who === "expired") return authError(401, "TOKEN_EXPIRED", "Access token expired; refresh it");
  const userId = who?.userId;

  try {
    const [drama, rewards, claimed] = await Promise.all([
      getDrama(id),
      getRewardConfig(),
      userId ? claimedEpisodeNumbers(userId, id) : Promise.resolve(null),
    ]);
    if (!drama) return Response.json({ error: "Drama not found" }, { status: 404 });
    const episodes = (await signEpisodes(await listEpisodes(id))).map((e) => ({
      ...e,
      rewardCoins: rewards.episode.coins,
      ...(claimed ? { rewardClaimed: claimed.has(e.ep) } : {}),
    }));
    return Response.json(
      { dramaId: id, episodes },
      {
        headers: {
          // Signed links stay valid for at least a day, so a short shared cache is safe when signed out.
          "Cache-Control": userId ? "private, no-store" : "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("Failed to list episodes:", error);
    return Response.json({ error: "Failed to load episodes" }, { status: 500 });
  }
}
