import type { StaffSession } from "@/lib/auth";
import type { AdminReelItem, ReelChanges, ReelPermissions } from "@/lib/types";

// Approval for moderator reels is currently off; see lib/moderation.ts.
export { MODERATOR_APPROVAL_REQUIRED } from "@/lib/moderation";

/**
 * True if this staff member may edit/publish/delete the reel: the admin any
 * reel; a moderator their own; a lead moderator also plain moderators' reels
 * (not the admin's or another lead's).
 */
export function canManageReel(session: StaffSession, createdById: string | null | undefined): boolean {
  return canManageOwned(session, createdById);
}

/**
 * Same rule for anything with a creator (reels, dramas): the admin anything;
 * a moderator what they created; a lead moderator also plain moderators' items.
 * Items with no recorded creator (e.g. imported dramas) are admin-only.
 */
export function canManageOwned(session: StaffSession, createdById: string | null | undefined): boolean {
  if (session.role === "admin") return true;
  if (!createdById) return false;
  if (createdById === session.actorId) return true;
  return session.lead && createdById.startsWith("mod:") && !session.leadActorIds.includes(createdById);
}

/**
 * What the signed-in staff member may do with a reel. The API enforces these
 * same rules; the UI only uses them to show the right buttons.
 *
 * Moderators act only on reels they uploaded:
 * - edit title/description/tags/drama/episode and replace video or thumbnail
 * - publish / unpublish it
 * - delete it (published or not; files are removed from Backblaze)
 */
export function reelPermissions(session: StaffSession, reel: AdminReelItem): ReelPermissions {
  if (session.role === "admin") {
    return {
      canEdit: true,
      canDelete: true,
      canTogglePublish: true,
      canUnpublish: reel.isPublished,
      canSubmit: false,
      canReview: reel.reviewStatus === "pending" || reel.pendingChanges !== null,
    };
  }
  // Own reel, or (lead moderator) a plain moderator's reel.
  const own = canManageReel(session, reel.createdById);
  // APPROVAL FLOW (disabled): with approvals on, moderators couldn't publish
  // and instead submitted drafts for review:
  // return {
  //   canEdit: own,
  //   canDelete: own && !reel.isPublished && !reel.firstPublishedAt,
  //   canTogglePublish: false,
  //   canUnpublish: own && reel.isPublished,
  //   canSubmit: own && !reel.isPublished && (reel.reviewStatus === "draft" || reel.reviewStatus === "rejected"),
  //   canReview: false,
  // };
  return {
    canEdit: own,
    // Previous rule (only never-published reels):
    // canDelete: own && !reel.isPublished && !reel.firstPublishedAt,
    canDelete: own,
    canTogglePublish: own,
    canUnpublish: own && reel.isPublished,
    canSubmit: false,
    canReview: false,
  };
}

/** Reads the moderator-editable fields from a request body (anything else is ignored). */
export function reelChangesFromBody(body: Record<string, unknown>): ReelChanges {
  const changes: ReelChanges = {};
  if (typeof body.title === "string") changes.title = body.title;
  if (body.synopsis !== undefined) changes.synopsis = typeof body.synopsis === "string" ? body.synopsis : null;
  if (body.tags !== undefined) {
    changes.tags = Array.isArray(body.tags)
      ? body.tags.map((t) => String(t).trim()).filter(Boolean)
      : typeof body.tags === "string"
      ? body.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
  }
  if (typeof body.videoUrl === "string") changes.videoUrl = body.videoUrl;
  if (body.thumbnailUrl !== undefined) {
    changes.thumbnailUrl = typeof body.thumbnailUrl === "string" ? body.thumbnailUrl : null;
  }
  if (body.durationSeconds !== undefined && Number.isFinite(Number(body.durationSeconds))) {
    changes.durationSeconds = Number(body.durationSeconds);
  }
  if (body.dramaId !== undefined) changes.dramaId = body.dramaId ? Number(body.dramaId) : null;
  if (body.episodeNumber !== undefined) changes.episodeNumber = body.episodeNumber ? Number(body.episodeNumber) : null;
  return changes;
}

export function actorOf(session: StaffSession) {
  return { actorId: session.actorId, displayName: session.displayName, role: session.role };
}

/**
 * Upload routes: admins may upload anywhere; moderators to the reels and
 * dramas folders; lead moderators also payout receipts. Nothing is ever
 * overwritten: every upload gets a free file name.
 */
export function canUploadTo(session: StaffSession, folderType: string | null | undefined): boolean {
  if (session.role === "admin" || folderType === "reels" || folderType === "dramas") return true;
  return folderType === "payouts" && session.lead;
}
