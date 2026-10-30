# Admin console: moderators

The console has two roles.

| | Admin | Moderator |
|---|---|---|
| Sign-in | Admin account stored in the database; changed on **My Account** | Account created on **Team** |
| Pages | Everything | **Reels** and **Rewards** (other pages redirect to Reels) |
| Upload reels | Publish now or save as draft | Publish now or save as draft (no approval needed) |
| Edit reels | Any reel | Only reels they uploaded |
| Edit a live reel | Applies immediately | Applies immediately (own reels) |
| Replace video / thumbnail | Yes | Yes (own reels) |
| Publish / unpublish | Any reel | Own reels |
| Delete | Any reel | Own reels that were **never published** |
| Coin rewards (Rewards page) | Yes | Yes (every change is in the Activity log under their name) |
| Approve / reject | Yes (**Waiting for approval** tab) | No (approval is currently off) |
| Dramas, users, payouts, transactions, referrals, settings, team, activity | Yes | No (APIs return 401) |

## Review flow (currently off)

Moderators currently publish without approval. The approval flow below is kept in the code for later: set `MODERATOR_APPROVAL_REQUIRED = true` in `lib/moderation.ts` and restore the lines marked `APPROVAL FLOW` in `lib/reelPermissions.ts` and `app/api/admin/reels/route.ts`. Reels already waiting for approval can still be reviewed by the admin.

1. A moderator uploads a reel and submits it → status **Waiting for approval**.
2. The admin opens **Reels → Waiting for approval** and clicks **Review** on the card.
   - New reel: watch it, then **Approve & publish** or **Reject**.
   - Changes to a live reel: a table shows each changed field (live vs proposed). Approve applies them; reject keeps the live version.
3. Rejecting requires a note. The moderator sees it on the card and in the edit dialog, fixes the reel and submits again.

Replaced or rejected video/thumbnail files are removed from Backblaze automatically (same delete queue as the rest of the console).

## Team page (admin)

- **Add moderator**: username (3–32 characters: letters, numbers, `.`, `-`, `_`), optional display name, password (10+ characters with letters and numbers; "Generate" makes one). Share the password privately; it can't be shown again.
- **Reset password** or **Disable**: signs the moderator out everywhere immediately.
- **Remove**: deletes the login. Their reels stay, still labelled with their name.

## Activity log (admin)

Every upload, edit, proposed change, approval, rejection, unpublish, delete, team change and moderator sign-in is recorded with who did it and when.

## Security notes

- Every API route checks the role on the server; hiding buttons in the UI is only for convenience.
- Moderator uploads always get a unique file name, so they can't overwrite the file behind a live reel, and they can only upload to the reels folder.
- Moderator sessions are re-checked against the database (15-second cache), so disabling or resetting a password takes effect almost immediately.
- Failed sign-ins are limited to 5 per username and IP address per 15 minutes.
- There are no default admin credentials anywhere.
- Existing admin sessions from before this change keep working until they expire, as long as `ADMIN_SECRET` was set when the server first started with this version.

## Admin account and session key (stored in Turso)

- The admin sign-in is a row in `admin_users` (role `admin`, password hashed with scrypt). Change the username, display name or password on **My Account**; it takes effect immediately, no redeploy.
- **First setup:** if no admin account exists, the first sign-in attempt creates it from `ADMIN_USERNAME` / `ADMIN_PASSWORD` (if set). After that those variables are ignored and can be deleted. Until an admin exists, the login page says so (moderators can still sign in).
- The key that signs console sessions is stored in `admin_config` (`session_secret`). It's generated automatically (or copied once from an existing `ADMIN_SECRET`, so nobody is signed out by the move). **My Account → Sign everyone out** replaces it; other server instances pick it up within a minute.
- **Locked out?** Delete the admin row in the Turso shell, set `ADMIN_USERNAME` / `ADMIN_PASSWORD` again and sign in; the account is recreated from them:

  ```sql
  DELETE FROM admin_users WHERE role = 'admin';
  ```
