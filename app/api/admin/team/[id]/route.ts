import { NextRequest, NextResponse } from "next/server";
import { forgetStaffAccountCache, getStaffSession } from "@/lib/auth";
import { deleteStaffAccount, getStaffAccount, logActivity, updateStaffAccount } from "@/lib/db";
import { hashPassword, passwordProblem } from "@/lib/passwords";
import { actorOf } from "@/lib/reelPermissions";

type Ctx = { params: Promise<{ id: string }> };

async function accountFrom(ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const account = await getStaffAccount(id);
  // The Team page manages moderators only; the admin account is changed on the Account page.
  return account?.role === "moderator" ? account : null;
}

/**
 * PATCH /api/admin/team/:id  { displayName?, password?, disabled? }
 * Resetting the password or disabling signs the moderator out everywhere.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await getStaffSession(req);
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const account = await accountFrom(ctx);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const changes: { displayName?: string; passwordHash?: string; disabled?: boolean } = {};
  const said: string[] = [];

  if (typeof body?.displayName === "string") {
    const name = body.displayName.trim();
    if (!name || name.length > 60) {
      return NextResponse.json({ error: "Display name must be 1–60 characters." }, { status: 400 });
    }
    if (name !== account.displayName) {
      changes.displayName = name;
      said.push(`renamed to ${name}`);
    }
  }
  if (typeof body?.password === "string" && body.password) {
    const problem = passwordProblem(body.password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    changes.passwordHash = hashPassword(body.password);
    said.push("reset password");
  }
  if (typeof body?.disabled === "boolean" && body.disabled !== account.disabled) {
    changes.disabled = body.disabled;
    said.push(body.disabled ? "disabled" : "re-enabled");
  }
  if (!said.length) return NextResponse.json({ success: true });

  await updateStaffAccount(account.id, changes);
  forgetStaffAccountCache(account.id);
  await logActivity(actorOf(session), {
    action: "staff.updated",
    entityType: "staff",
    entityId: account.id,
    summary: `@${account.username}: ${said.join(", ")}`,
  });
  return NextResponse.json({ success: true });
}

/** DELETE /api/admin/team/:id: removes the login. Their reels and history stay. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await getStaffSession(req);
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const account = await accountFrom(ctx);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  await deleteStaffAccount(account.id);
  forgetStaffAccountCache(account.id);
  await logActivity(actorOf(session), {
    action: "staff.deleted",
    entityType: "staff",
    entityId: account.id,
    summary: `Removed moderator ${account.displayName} (@${account.username})`,
  });
  return NextResponse.json({ success: true });
}
