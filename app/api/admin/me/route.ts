import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { countPendingReviews } from "@/lib/db";

/** GET /api/admin/me: who is signed in to the console, and what they may do. */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { session } = auth;
  return NextResponse.json({
    actorId: session.actorId,
    role: session.role,
    username: session.username,
    displayName: session.displayName,
    pendingReviewCount: session.role === "admin" ? await countPendingReviews() : 0,
  });
}
