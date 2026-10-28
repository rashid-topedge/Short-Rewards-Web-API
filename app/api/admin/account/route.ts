import { NextRequest, NextResponse } from "next/server";
import { forgetAdminAccountCache, getStaffSession, issueStaffToken, setAdminCookie } from "@/lib/auth";
import { getAdminAccount, logActivity, updateAdminCredentials } from "@/lib/db";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/passwords";
import { actorOf } from "@/lib/reelPermissions";

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

/** GET /api/admin/account: the admin's own sign-in details (admin only). */
export async function GET(req: NextRequest) {
  const session = await getStaffSession(req);
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const account = await getAdminAccount();
  if (!account) return NextResponse.json({ error: "Admin account not found" }, { status: 404 });
  return NextResponse.json({
    username: account.username,
    displayName: account.displayName,
    lastLoginAt: account.lastLoginAt,
  });
}

/**
 * PATCH /api/admin/account  { currentPassword, username?, displayName?, newPassword? }
 * Changes the admin's sign-in. Takes effect immediately, no redeploy. A new
 * password signs out the admin's other sessions; this one stays signed in.
 */
export async function PATCH(req: NextRequest) {
  const session = await getStaffSession(req);
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const account = await getAdminAccount();
  if (!account) return NextResponse.json({ error: "Admin account not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  if (!currentPassword || !verifyPassword(currentPassword, account.passwordHash)) {
    return NextResponse.json({ error: "Your current password is incorrect.", code: "WRONG_PASSWORD" }, { status: 403 });
  }

  const changes: { username?: string; displayName?: string; passwordHash?: string } = {};
  const said: string[] = [];
  if (typeof body?.username === "string" && body.username.trim() !== account.username) {
    const username = body.username.trim();
    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { error: "Username must be 3–32 characters: letters, numbers, dot, dash or underscore." },
        { status: 400 }
      );
    }
    changes.username = username;
    said.push(`changed username to @${username}`);
  }
  if (typeof body?.displayName === "string" && body.displayName.trim() !== account.displayName) {
    const name = body.displayName.trim();
    if (!name || name.length > 60) {
      return NextResponse.json({ error: "Display name must be 1–60 characters." }, { status: 400 });
    }
    changes.displayName = name;
    said.push(`renamed to ${name}`);
  }
  if (typeof body?.newPassword === "string" && body.newPassword) {
    const problem = passwordProblem(body.newPassword);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    changes.passwordHash = hashPassword(body.newPassword);
    said.push("changed password");
  }
  if (!said.length) return NextResponse.json({ success: true, changed: false });

  const result = await updateAdminCredentials(account.id, changes);
  if (!result.ok) {
    return result.reason === "taken"
      ? NextResponse.json({ error: "That username is already used by a moderator." }, { status: 409 })
      : NextResponse.json({ error: "Admin account not found" }, { status: 404 });
  }
  forgetAdminAccountCache();

  await logActivity(actorOf(session), {
    action: "admin.account_updated",
    entityType: "staff",
    entityId: account.id,
    summary: `Admin ${said.join(", ")}`,
  });

  const response = NextResponse.json({ success: true, changed: true });
  if (changes.passwordHash) {
    // Keep this browser signed in with the new session version.
    const updated = await getAdminAccount();
    if (updated) setAdminCookie(response, await issueStaffToken(updated));
  }
  return response;
}
