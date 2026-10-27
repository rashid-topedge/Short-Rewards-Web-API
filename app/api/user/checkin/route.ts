import { NextRequest, NextResponse } from "next/server";
import { checkInUser } from "@/lib/db";
import { claimResponse, readClaimId } from "@/lib/claimHttp";
import { requireUser } from "@/lib/userAuth";

/**
 * POST /api/user/checkin[?lite=1]
 * Optional: Idempotency-Key header (or body.claimId) — reuse it when retrying.
 * 200 claimed (or `replayed: true`), 409 ALREADY_CLAIMED (today's bonus was already taken, from any device).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await requireUser(req, body?.userId);
    if (!auth.ok) return auth.response;

    const claim = readClaimId(req, body);
    if (!claim.ok) return claim.response;
    const { claimId } = claim;

    // ?lite=1: skip the 30-transaction history in the returned profile (load it from /api/user/transactions).
    const includeTransactions = new URL(req.url).searchParams.get("lite") !== "1";

    const result = await checkInUser(auth.userId, { includeTransactions, claimId });
    return claimResponse(result);
  } catch (err: unknown) {
    console.error("Failed to check in user:", err);
    return NextResponse.json({ error: "Internal server error performing check-in" }, { status: 500 });
  }
}
