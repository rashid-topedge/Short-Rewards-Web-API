import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { createStaffAccount, listStaffAccounts, logActivity } from "@/lib/db";
import { hashPassword, passwordProblem } from "@/lib/passwords";
import { actorOf } from "@/lib/reelPermissions";

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

/** GET /api/admin/team: moderator accounts (admin only). */
export async function GET(req: NextRequest) {
  const session = await getStaffSession(req);
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ items: await listStaffAccounts() });
}

/** POST /api/admin/team  { username, displayName?, password } → creates a moderator. */
export async function POST(req: NextRequest) {
  const session = await getStaffSession(req);
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const displayName = (typeof body?.displayName === "string" ? body.displayName.trim() : "") || username;
  const password = typeof body?.password === "string" ? body.password : "";

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3–32 characters: letters, numbers, dot, dash or underscore." },
      { status: 400 }
    );
  }
  if (username.toLowerCase() === session.username.trim().toLowerCase()) {
    return NextResponse.json({ error: "That username is taken." }, { status: 409 });
  }
  if (displayName.length > 60) {
    return NextResponse.json({ error: "Display name is too long (60 characters max)." }, { status: 400 });
  }
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const result = await createStaffAccount({ username, displayName, passwordHash: hashPassword(password) });
  if (!result.ok) return NextResponse.json({ error: "That username is taken." }, { status: 409 });

  await logActivity(actorOf(session), {
    action: "staff.created",
    entityType: "staff",
    entityId: result.id,
    summary: `Added moderator ${displayName} (@${username})`,
  });
  return NextResponse.json({ success: true, id: result.id });
}
