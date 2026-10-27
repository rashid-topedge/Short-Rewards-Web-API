import { NextRequest, NextResponse } from "next/server";
import { listUserTransactions } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/transactions?limit=30&cursor=<nextCursor>
 * Header: Authorization: Bearer <accessToken>
 *
 * The signed-in user's coin history, newest first. Pass the returned
 * `nextCursor` to get the next page; it is null on the last page.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const auth = await requireUser(req, searchParams.get("userId")?.trim());
    if (!auth.ok) return auth.response;

    const limit = parseInt(searchParams.get("limit") || "30", 10);
    const data = await listUserTransactions(auth.userId, {
      cursor: searchParams.get("cursor"),
      limit: Number.isFinite(limit) ? limit : 30,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to list user transactions:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
