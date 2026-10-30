import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { getReferralStatsAdmin, listReferralsAdmin } from "@/lib/db";

/**
 * GET /api/admin/referrals?status=pending|rewarded|rejected&userId=&cursor=&limit=
 * Add `stats=1` for totals and top referrers.
 */
export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const [page, stats] = await Promise.all([
    listReferralsAdmin({
      status: sp.get("status") || undefined,
      userId: sp.get("userId") || undefined,
      cursor: sp.get("cursor"),
      limit: Number(sp.get("limit")) || 30,
    }),
    sp.get("stats") === "1" ? getReferralStatsAdmin() : Promise.resolve(null),
  ]);
  return NextResponse.json({ ...page, stats });
}
