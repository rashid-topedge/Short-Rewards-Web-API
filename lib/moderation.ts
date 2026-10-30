/**
 * Moderator reels need admin approval before going live: currently OFF.
 * Moderators publish their own reels directly and their edits apply at once.
 * The approval code is kept (commented out or behind this flag) in
 * lib/reelPermissions.ts, the reel API routes and the Reels page; search for
 * "APPROVAL FLOW". Turning it back on: set this to true and restore the
 * commented lines in lib/reelPermissions.ts and app/api/admin/reels/route.ts.
 * (No imports here, so client components can use it.)
 */
export const MODERATOR_APPROVAL_REQUIRED = false;
