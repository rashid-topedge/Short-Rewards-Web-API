import { NextResponse } from "next/server";
import type { StaffSession } from "@/lib/auth";
import { getDramaOwnerInfo, type DramaOwnerInfo } from "@/lib/db";
import { canManageOwned } from "@/lib/reelPermissions";

/**
 * Drama permissions, same rule as reels: the admin any drama; a moderator the
 * dramas they created (with their episodes); a lead moderator also plain
 * moderators' dramas. Imported/older dramas with no creator are admin-only.
 */
export function dramaPermissions(session: StaffSession, createdById: string | null | undefined) {
  const can = canManageOwned(session, createdById);
  return { canEdit: can, canDelete: can };
}

/** Loads the drama and checks the staff member may change it; returns an error response otherwise. */
export async function dramaForChange(
  session: StaffSession,
  dramaId: number
): Promise<{ ok: true; drama: DramaOwnerInfo } | { ok: false; response: NextResponse }> {
  const drama = Number.isInteger(dramaId) && dramaId > 0 ? await getDramaOwnerInfo(dramaId) : null;
  if (!drama) return { ok: false, response: NextResponse.json({ error: "Drama not found" }, { status: 404 }) };
  if (!canManageOwned(session, drama.createdById)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: session.lead
            ? "You can only change your own dramas and other moderators' dramas (not the admin's or another lead's)."
            : "You can only change dramas you created.",
          code: "NOT_OWNER",
        },
        { status: 403 }
      ),
    };
  }
  return { ok: true, drama };
}

/** " (created by Sara)" when someone changes a drama they didn't create. */
export function dramaOwnerNote(session: StaffSession, drama: DramaOwnerInfo): string {
  return session.role !== "admin" && drama.createdById !== session.actorId
    ? ` (created by ${drama.createdByName || "another moderator"})`
    : "";
}

/** A bucket folder name the browser picked for a new drama's cover ("my-drama-x7k2p9"). */
export function validNewDramaFolder(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{2,90}$/.test(value) ? value : null;
}
