import type { StaffSession } from "@/lib/auth";
import type { AdminReelItem, ReelChanges, ReelPermissions } from "@/lib/types";

// Approval for moderator reels is currently off; see lib/moderation.ts.
export { MODERATOR_APPROVAL_REQUIRED } from "@/lib/moderation";

/**
 * What the signed-in staff member may do with a reel. The API enforces these
 * same rules; the UI only uses them to show the right buttons.
 *
 * Moderators act only on reels they uploaded:
 * - edit title/description/tags/drama/episode and replace video or thumbnail
 * - publish / unpublish it
 * - delete it only if it was never published
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
  const own = reel.createdById === session.actorId;
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
    canDelete: own && !reel.isPublished && !reel.firstPublishedAt,
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
 * Upload routes: admins may upload anywhere; moderators only to the reels
 * folder (never dramas or payout receipts).
 */
export function canUploadTo(session: StaffSession, folderType: string | null | undefined): boolean {
  return session.role === "admin" || folderType === "reels";
}
