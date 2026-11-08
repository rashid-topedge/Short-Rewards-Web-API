import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { logActivity, purgeDueAccountDeletions } from "@/lib/db";

export const maxDuration = 60;

/**
 * GET /api/cron/purge-accounts — deletes accounts whose 7-day waiting period
 * is over. Run daily by Vercel Cron (vercel.json); Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`. Refused when CRON_SECRET isn't set.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || "";
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const ok =
    secret.length >= 16 &&
    given.length === secret.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await purgeDueAccountDeletions();
    for (const userId of result.deleted) {
      await logActivity(
        { actorId: "system", displayName: "Account deletion", role: "system" },
        {
          action: "user.deleted_by_request",
          entityType: "user",
          entityId: userId,
          summary: `Deleted account ${userId} (requested by the user)`,
        }
      ).catch((err) => console.error("Activity log failed:", err));
    }
    return NextResponse.json({ deleted: result.deleted.length, waitingForPayout: result.waitingForPayout.length });
  } catch (err) {
    console.error("Account purge failed:", err);
    return NextResponse.json({ error: "Purge failed" }, { status: 500 });
  }
}
