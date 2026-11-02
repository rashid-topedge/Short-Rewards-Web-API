# Admin console: moderators

The console has three roles.

| | Admin | Lead moderator | Moderator |
|---|---|---|---|
| Sign-in | Admin account stored in the database; changed on **My Account** | Account created on **Team** | Account created on **Team** |
| Pages | Everything | **Dramas**, **Reels**, **Rewards**, **Team** | **Dramas** and **Reels** (other pages redirect to Reels) |
| Create dramas | Yes | Yes | Yes |
| Edit / publish / delete dramas, add / remove / upload episodes | Any drama | Own dramas + plain moderators' dramas | Own dramas only |
| Dramas with no creator (imported/older) | Yes | No (view only) | No (view only) |
| Bulk drama actions, "Publish All with Episodes", play/like counts | Yes | No | No |
| Upload reels | Publish now or save as draft | Same | Same (no approval needed) |
| Edit, replace video/thumbnail, publish/unpublish | Any reel | Own reels + plain moderators' reels | Own reels |
| Delete reels | Any reel | Own reels + plain moderators' reels | Own reels (published or not) |
| Admin's or another lead's reels | Yes | No | No |
| Coin rewards (Rewards page) | Yes | Yes (logged under their name) | No |
| Add moderators, rename, reset password, disable, remove | Yes, anyone | Plain moderators only | No |
| Make / remove lead moderator | Yes | No | No |
| Approve / reject | Yes (**Waiting for approval** tab) | No (approval is currently off) | No |
| Dramas, users, payouts, transactions, referrals, settings, activity | Yes | No | No |

## Dramas

- Every staff member sees all dramas; the ones they can't change show **View only**. **Mine** filters to their own.
- When a moderator deletes their drama, its episodes and files are deleted. Linked reels they may manage are deleted too; other people's linked reels (e.g. yours) are only unlinked and stay.
- Every drama, episode upload, replace and delete is in the Activity log (with "created by …" when a lead changes someone else's drama).

## Lead moderators

- **Make someone a lead:** Team → shield button on their row (or tick **Lead moderator** when adding them). Remove it with the same button.
- Takes effect within about 15 seconds, without signing them out. Removing lead closes Rewards and Team for them right away.
- A lead can't change their own account or another lead's on the Team page, and can't create leads.
- When a lead edits or deletes another moderator's reel, the Activity log says so, e.g. `Deleted "Ep 4 clip" (uploaded by Sara)`.
- Stored as `admin_users.is_lead` (schema v13).

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
