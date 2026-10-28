import { NextRequest, NextResponse, after } from "next/server";
import { processB2DeleteQueue } from "@/lib/b2Cleanup";
import { requireStaff } from "@/lib/auth";
import { logActivity, reviewReel } from "@/lib/db";
import { actorOf, reelPermissions } from "@/lib/reelPermissions";

/**
 * POST /api/admin/reels/:id/review   { action: "approve" | "reject", note? }
 * Admin only. Approves/rejects a moderator's new reel or their pending changes
 * to a live reel. Rejecting requires a note, which the moderator sees.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ reelId: string }> }) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { session } = auth;
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Only admins can approve or reject reels." }, { status: 403 });
  }

  const id = parseInt((await ctx.params).reelId, 10);
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }
  if (action === "reject" && !note) {
    return NextResponse.json({ error: "Please add a note explaining what to fix." }, { status: 400 });
  }

  const result = await reviewReel(id, { displayName: session.displayName }, action, note);
  if (!result.ok) {
    return result.reason === "not_found"
      ? NextResponse.json({ error: "Reel not found" }, { status: 404 })
      : NextResponse.json({ error: "This reel has nothing waiting for approval." }, { status: 409 });
  }

  const what = result.kind === "changes" ? "changes to" : "";
  await logActivity(actorOf(session), {
    action: `reel.${result.kind === "changes" ? "changes_" : ""}${result.decision}`,
    entityType: "reel",
    entityId: id,
    summary: `${result.decision === "approved" ? "Approved" : "Rejected"} ${what} "${result.reel.title}"`.replace(/\s+/g, " ") +
      (note ? ` — ${note}` : ""),
    details: note ? { note } : null,
  });

  after(() => processB2DeleteQueue().catch((err) => console.error("Background B2 cleanup failed:", err)));
  return NextResponse.json({ ...result.reel, permissions: reelPermissions(session, result.reel), decision: result.decision });
}
