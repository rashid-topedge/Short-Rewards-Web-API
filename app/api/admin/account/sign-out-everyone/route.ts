import { NextRequest, NextResponse } from "next/server";
import { getStaffSession, issueStaffToken, setAdminCookie } from "@/lib/auth";
import { rotateSessionSecret } from "@/lib/adminSecret";
import { getAdminAccount, logActivity } from "@/lib/db";
import { actorOf } from "@/lib/reelPermissions";

/**
 * POST /api/admin/account/sign-out-everyone (admin only)
 * Replaces the session-signing secret stored in the database, so every console
 * session (admin and moderators) must sign in again. This browser stays signed in.
 */
export async function POST(req: NextRequest) {
  const session = await getStaffSession(req);
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await rotateSessionSecret();
  await logActivity(actorOf(session), {
    action: "admin.sessions_reset",
    entityType: "staff",
    summary: "Signed everyone out of the console",
  });

  const response = NextResponse.json({ success: true });
  const account = await getAdminAccount();
  if (account) setAdminCookie(response, await issueStaffToken(account));
  return response;
}
