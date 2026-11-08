import { NextRequest, NextResponse } from "next/server";
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  cancelAccountDeletion,
  getDeletionStatus,
  requestAccountDeletion,
} from "@/lib/db";
import { authError, requireUser } from "@/lib/userAuth";

/**
 * Account deletion (Authorization: Bearer <accessToken>).
 *
 * GET    → { deletionRequestedAt, deletionDueAt }   (both null when not requested)
 * POST   { "confirm": true } → asks to delete the account. It is signed out
 *        everywhere now and deleted for good after 7 days (`deletionDueAt`).
 *        409 PAYOUT_PENDING while a payout is waiting.
 * DELETE → keeps the account (cancels the request). To do this after the
 *        request, sign in again (the profile shows `deletionDueAt`) and call it.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const status = await getDeletionStatus(auth.userId);
  if (!status) return authError(404, "ACCOUNT_NOT_FOUND", "Account not found");
  return NextResponse.json(status, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== true) {
      return authError(400, "CONFIRM_REQUIRED", 'Send { "confirm": true } to delete the account');
    }
    const result = await requestAccountDeletion(auth.userId);
    if (!result.ok) {
      if (result.reason === "payout_pending") {
        return authError(
          409,
          "PAYOUT_PENDING",
          "You have a payout that hasn't been processed yet. You can delete your account once it's paid or rejected."
        );
      }
      return authError(404, "ACCOUNT_NOT_FOUND", "Account not found");
    }
    return NextResponse.json({
      success: true,
      message: `Your account will be deleted on the date shown. Sign in again within ${ACCOUNT_DELETION_GRACE_DAYS} days to keep it.`,
      ...result.status,
    });
  } catch (err) {
    console.error("Failed to request account deletion:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    if (!(await cancelAccountDeletion(auth.userId))) return authError(404, "ACCOUNT_NOT_FOUND", "Account not found");
    return NextResponse.json({ success: true, message: "Your account will not be deleted.", deletionRequestedAt: null, deletionDueAt: null });
  } catch (err) {
    console.error("Failed to cancel account deletion:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
