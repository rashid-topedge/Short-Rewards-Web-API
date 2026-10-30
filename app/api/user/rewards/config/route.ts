import { NextResponse } from "next/server";
import { getRewardConfig } from "@/lib/db";
import { publicRewardConfig } from "@/lib/rewardConfig";

/**
 * GET /api/user/rewards/config (no sign-in needed)
 * Current reward amounts, so the app can show them without an update.
 * Cached by CDNs for a minute.
 */
export async function GET() {
  const config = await getRewardConfig();
  return NextResponse.json(publicRewardConfig(config), {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" },
  });
}
