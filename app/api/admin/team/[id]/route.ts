import { NextRequest, NextResponse } from "next/server";
import { forgetStaffAccountCache, getStaffSession, isAdminOrLead, type StaffSession } from "@/lib/auth";
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

/** The admin manages every moderator; a lead moderator only plain moderators (not leads, so not themselves). */
function forbiddenFor(session: StaffSession, account: { lead: boolean }) {
  if (session.role === "admin" || !account.lead) return null;
  return NextResponse.json({ error: "Only the admin can change lead moderators." }, { status: 403 });
}

/**
 * PATCH /api/admin/team/:id  { displayName?, password?, disabled?, lead? }
 * Resetting the password or disabling signs the moderator out everywhere.
 * `lead` (make / remove lead moderator) is admin-only.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await getStaffSession(req);
  if (!isAdminOrLead(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const account = await accountFrom(ctx);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const forbidden = forbiddenFor(session, account);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const changes: { displayName?: string; passwordHash?: string; disabled?: boolean; lead?: boolean } = {};
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
  if (typeof body?.lead === "boolean" && body.lead !== account.lead) {
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Only the admin can make or remove lead moderators." }, { status: 403 });
    }
    changes.lead = body.lead;
    said.push(body.lead ? "made lead moderator" : "no longer lead moderator");
  }
  if (!said.length) return NextResponse.json({ success: true });

  const updated = await updateStaffAccount(account.id, changes, { onlyIfNotLead: session.role !== "admin" });
  if (!updated) return NextResponse.json({ error: "Account not found" }, { status: 404 });
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
  if (!isAdminOrLead(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const account = await accountFrom(ctx);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const forbidden = forbiddenFor(session, account);
  if (forbidden) return forbidden;

  const deleted = await deleteStaffAccount(account.id, { onlyIfNotLead: session.role !== "admin" });
  if (!deleted) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  forgetStaffAccountCache(account.id);
  await logActivity(actorOf(session), {
    action: "staff.deleted",
    entityType: "staff",
    entityId: account.id,
    summary: `Removed moderator ${account.displayName} (@${account.username})`,
  });
  return NextResponse.json({ success: true });
}
