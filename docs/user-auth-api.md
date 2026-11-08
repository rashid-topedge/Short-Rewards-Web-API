# User authentication API (Android app)

Accounts start **anonymous** on first launch and can later be **linked to a Google
account**, which lets the user get the same account back after reinstalling or on a
new phone. Don't use the advertising ID for accounts (Play policy forbids linking it
to accounts/PII, and users can reset or delete it).

## Tokens

| Token | Lifetime | Where to keep it | Used for |
|---|---|---|---|
| `accessToken` (JWT) | 30 min | memory / EncryptedSharedPreferences | `Authorization: Bearer <accessToken>` on every request |
| `refreshToken` (`rt_…`) | 180 days, rotates on every use | EncryptedSharedPreferences | getting a new token pair |

Every refresh returns a **new** refresh token, and the old one stops working.
Always save the new one. Run only one refresh at a time per device.

## Flows

### First launch (no saved tokens)
```
POST /api/user/sync
{ "requestToken": true }                       // new account
{ "requestToken": true, "userId": "<old id>" } // existing installs keeping their pre-auth account (works once)
→ 200 { ...profile, accessToken, accessTokenExpiresIn, refreshToken, refreshTokenExpiresIn }
→ 409 ACCOUNT_ALREADY_CLAIMED   // that old userId already has a token: use Google sign-in to recover it
→ 429 TOO_MANY_ACCOUNTS         // too many new accounts from one network this hour (Retry-After header)
```

### Every API call
Send `Authorization: Bearer <accessToken>`. If the response is
`401 { "code": "TOKEN_EXPIRED" }`, refresh and retry the call once.

### Refresh
```
POST /api/user/refresh
{ "refreshToken": "rt_..." }
→ 200 { accessToken, accessTokenExpiresIn, refreshToken, refreshTokenExpiresIn }
→ 401 REFRESH_INVALID | REFRESH_EXPIRED | REFRESH_REVOKED | REFRESH_REUSED   // sign in again
```

### Link Google (e.g. "Back up your account" button)
Use Credential Manager → Sign in with Google, passing the **Web** client ID as
`serverClientId`, and send the resulting ID token:
```
POST /api/user/link-google        Authorization: Bearer <accessToken>
{ "idToken": "<Google ID token>" }
→ 200 { ...profile, googleLinked: true, googleEmail, linked: true }
→ 409 GOOGLE_ACCOUNT_IN_USE    // that Google account already has an app account.
                                // Offer: "Switch to that account? This guest account's coins stay behind."
                                // If yes → call login-google with the same idToken.
→ 409 ACCOUNT_ALREADY_LINKED   // this account is linked to a different Google account
→ 401 GOOGLE_TOKEN_INVALID
```

### Firebase sign-in (guest and Google)
```
POST /api/user/firebase-session
{ "firebaseIdToken": "<Firebase ID token>", "userId": "<Firebase UID>", "legacyUserId"?: "<pre-auth id>" }
→ 200 { ...profile, accessToken, refreshToken, ..., created }
```
- **The Google account decides.** If the token carries a Google account that already has an app
  account, that account is returned, even if the phone was using a guest account or the Firebase
  user was deleted and re-created. The app should then show that account's coins.
- The guest account the phone was using is left as it is (coins are **not** moved over). Before
  linking Google on a guest with earned coins, warn: "You'll switch to your Google account."
- Each switch is recorded in the admin activity log (`user.signin_recovered`).
- `409 GOOGLE_ACCOUNT_IN_USE` is no longer returned by this endpoint.

### Sign in with Google (reinstall, new phone, or switching accounts)
```
POST /api/user/login-google
{ "idToken": "<Google ID token>" }
→ 200 { ...profile, accessToken, refreshToken, ..., created }   // created=true → brand-new account
```

### Log out
```
POST /api/user/logout
{ "refreshToken": "rt_..." }
→ 200   // then delete both tokens on the device
```

### Redeem
If the server has `REDEEM_REQUIRE_GOOGLE=true`, unlinked accounts get
`403 { "code": "GOOGLE_LINK_REQUIRED" }` from `POST /api/user/redeem`: prompt the user
to link Google first. `profile.googleLinked` tells you in advance.

## Claiming rewards and check-ins (duplicate protection)

The server refuses a second claim on its own, from any device on the account:

| Endpoint | Pays at most once per |
|---|---|
| `POST /api/user/checkin` | user per day (Pakistan time) |
| `POST /api/user/reward/episode` `{dramaId, ep}` | user per episode |
| `POST /api/user/reward/reel` `{reelId}` | user per reel |
| `POST /api/user/reward/ad` `{adType}` | user per claim ID (one ID per ad view) |

**Claim ID.** For every claim, generate a random UUID once and send it as the
`Idempotency-Key` header (or `claimId` in the body). Save it with the pending
claim and **reuse the same ID when retrying** (timeout, no network, app killed).
If the server already processed it, you get the original answer back with
`replayed: true`: no double payment, and no false error. Use a new ID for each
new claim (each check-in tap, each ad view, each episode or reel).

| Response | Meaning | What the app should do |
|---|---|---|
| `200` | Granted (or `replayed: true`) | Show `coinsEarned`, set balance to `newCoinsBalance`, clear the pending claim |
| `409 ALREADY_CLAIMED` | Already paid earlier, e.g. on another device | Not an error: mark it claimed, update balance from `newCoinsBalance` / `user`, clear the pending claim |
| `429 DAILY_LIMIT` / `COOLDOWN` | Over today's limit / too soon (`Retry-After` header) | Show the message; nothing was paid. For COOLDOWN you may retry after the wait with the same ID |
| `422 CLAIM_ID_REUSED` | That ID was used for a different claim | Bug in the app: generate a new ID |
| `400 CLAIM_ID_REQUIRED` | Ad claim without an ID (server has `REQUIRE_AD_CLAIM_ID=true`) | Send an ID |
| `401 TOKEN_EXPIRED` | Access token expired | Refresh, then retry **with the same claim ID** |
| `5xx` / network error | Unknown whether it was granted | Retry later with the **same** claim ID |

Every one of these bodies includes `newCoinsBalance` and `user`, so the balance
on screen can always be updated from the response.

## Coin history and lighter responses

Check-in, rewards (`/api/user/reward/ad|episode|reel`) and redeem return the
user's profile. By default it includes the 30 most recent transactions. Add
`?lite=1` to skip them (saves a database query per reward), and load history
only on the wallet screen. The same works for the profile itself:
`POST /api/user/sync?lite=1` (or `{ "lite": true }` in the body) returns the profile with
`transactions: []`; use it on app start and pull-to-refresh.

```
GET /api/user/transactions?limit=30            Authorization: Bearer <accessToken>
→ 200 { items: [ { id, type, amount, description, createdAt } ], nextCursor }
GET /api/user/transactions?limit=30&cursor=<nextCursor>   // next page; nextCursor is null on the last page
```

## Error format
All auth errors are `{ "error": "<human message>", "code": "<CODE>" }`.

## Server configuration
- `USER_TOKEN_SECRET`: at least 32 random characters.
- `GOOGLE_OAUTH_CLIENT_IDS`: the Web client ID (comma-separate several if needed).
- `USER_AUTH_ALLOW_LEGACY=true` during the app rollout; set it to `false` once all users are on the new version.
- `REDEEM_REQUIRE_GOOGLE`: optional, `false` by default.
- `SIGNUP_LIMIT_PER_HOUR`: new anonymous accounts allowed per IP per hour (default 30, `0` = off).
  Mobile networks share IPs, so don't set it too low.

## Reward amounts (set by admin)

Amounts can change at any time (admin → Rewards), so don't hard-code them:

```
GET /api/user/rewards/config        (no sign-in; cache up to 60 s)
→ 200 { signupBonus, checkIn: { streak: [..], cycleDays }, ad: { coins, maxPerDay, cooldownSeconds },
        episode: { coins }, reel: { tiers: [{ upToSeconds, coins }], longerThanLastTier, unknownLength,
        maxPerDay, watchTokenMode, minWatchPercent }, referral: { enabled, referrerCoins, refereeCoins,
        applyWithinDays, qualify: { requireGoogleLink, minReelsWatched } } }
```
Every reward response still says what was actually paid (`coinsEarned`); show that.

## Reels pay by length (watch sessions)

1. When a reel starts playing:
   ```
   POST /api/user/reward/reel/start   { reelId }         Authorization: Bearer <accessToken>
   → 200 { watchToken, coins, durationSeconds, minWatchSeconds, alreadyClaimed }
   → 404 REEL_NOT_FOUND
   ```
   Show "+{coins}" (skip if `alreadyClaimed`). Keep `watchToken` with the reel.
2. Once at least `minWatchSeconds` have passed (e.g. when the reel finishes):
   ```
   POST /api/user/reward/reel?lite=1  { reelId, watchToken }   + Idempotency-Key
   → 200 { coinsEarned, newCoinsBalance, reelSeconds, ... }
   → 425 TOO_EARLY (Retry-After: seconds)   // claimed before minWatchSeconds; nothing used up, retry later
   → 400 INVALID_WATCH_TOKEN                // token for another reel/user, or older than 6 h: call /start again
   → 400 WATCH_TOKEN_REQUIRED               // admin requires watch tokens and none was sent
   → 409 ALREADY_CLAIMED, 429 DAILY_LIMIT, 404 REEL_NOT_FOUND
   ```
   Measure the wait from when `/start` answered; pausing doesn't need special handling (the
   server only checks that enough time has passed). Older app builds that send no token are
   paid the admin's "older app versions" amount until the admin switches the check to Required.

## Referrals

```
GET /api/user/referral                                Authorization: Bearer <accessToken>
→ 200 { code, shareLink, enabled, referrerCoins, refereeCoins,
        invited: { total, pending, rewarded, rejected }, coinsEarned,
        myReferral: { status: "none"|"pending"|"rewarded"|"rejected", canApply, applyUntil,
                      requirements: { googleLinked, reelsWatched, reelsNeeded } } }

POST /api/user/referral/apply   { code }               Authorization: Bearer <accessToken>
→ 200 { status: "pending"|"rewarded", refereeCoins, referral, user }
→ 404 INVALID_CODE, 409 ALREADY_REFERRED, 403 TOO_LATE | REFERRALS_DISABLED, 400 SELF_REFERRAL | CIRCULAR
```
- Show the "Enter a friend's code" field only while `myReferral.canApply` is true. Codes are 7
  characters; case, spaces and dashes are ignored.
- A referral is paid when the new user meets `requirements` (e.g. links Google and earns rewards
  for N reels). It happens automatically during a later claim or Google link: that response has
  `referralBonus` (coins) and the message mentions it. Use `myReferral.requirements` to show progress.
- The inviter sees new coins as ledger entries of type `REFERRAL_REFERRER`; the new user's are
  `REFERRAL_REFEREE`.
- Optional: pass the code through the Play Install Referrer (`shareLink`) and call `/apply`
  automatically on first launch.

## Reel feed: new reels first

```
GET /api/reels?sort=newest|trending|random&limit=10[&cursor=…][&dramaId=…]
Authorization: Bearer <accessToken>    (optional)
```
- **Signed in:** reels the user hasn't earned coins for come first (in the chosen sort), then the
  ones they have (newest first), so every reel still appears exactly once. Each item has
  `rewardClaimed` (true = already paid) and the response has `personalized: true`.
- **Not signed in:** the normal feed, as before.
- Every item has `rewardCoins`: what that reel pays by length (with a watch token).
- Signed in, every item also has `liked` (this user has liked it).
- Always pass `nextCursor` back unchanged (it now looks like `n:…` / `s:…`); stop when it's `null`.
  `sort=random` still returns `"random"` as the cursor: just ask again for more.
- An expired token gets `401 TOKEN_EXPIRED` here too: refresh and retry. Add `personal=0` to get the
  plain feed while signed in.
- Responses are per user: don't cache them in a shared cache.
- "Seen" means "earned coins for". A reel watched without a claim (e.g. after the daily limit)
  stays in the new part, so it can still pay later.

## Reel detail, views and likes

```
GET  /api/reels/{reelId}                       Authorization: Bearer <accessToken>   (optional)
→ { ...reel, rewardCoins }                     + rewardClaimed, liked when signed in
POST /api/reels/{reelId}  { "action": "view" }                → counts a view
POST /api/reels/{reelId}  { "action": "like" | "unlike" }     Authorization: Bearer <accessToken>
→ { success, reelId, liked, likeCount }
```
- With a token a like counts **once per user**: liking again or unliking a reel that isn't liked
  changes nothing, and the like is kept across reinstalls (it's tied to the account). Use the
  returned `likeCount` / `liked` to update the UI.
- Without a token (old app builds) like/unlike still just moves the count; send the token.
- 404 when the reel doesn't exist or isn't published.

## Multi-part reels (long videos split into 3-minute parts)

When the admin uploads a video longer than 3 minutes, the console can cut it into ~3-minute parts.
Each part is a normal reel (own `reelId`, own reward, titled e.g. "Title (Part 2/3)") with a `part`
field linking it to the others:

```json
"part": { "group": "pg_44d3b3aa82f35d0596", "number": 2, "count": 3 }
```

- Reels without `part` are single videos (the field is absent).
- To show "Next part" / "All parts", fetch the group (published parts only, in order, same item
  shape as the feed, including `rewardCoins`):

  ```
  GET /api/reels?partGroup=pg_44d3b3aa82f35d0596
  → { "items": [ { "reelId": 501, "part": { "number": 1, ... } }, ... ] }
  ```
- A part can be unpublished or deleted on its own, so `items` can have gaps (e.g. parts 1 and 3).
  Use `part.number` for labels and the list order for "next".

## Dramas and episodes

All dramas and episodes are now your own uploads (no scraped data). Covers, videos and
thumbnails are in a private bucket, so every link in these responses is **signed**: use it as
given, don't build URLs yourself, and don't keep links longer than a day (fetch again instead).

```
GET /api/dramas?limit=24[&q=…][&cursor=…]     → { items: [ { dramaId, slug, title, cover, playCount,
                                                  episodeCount, latestEpisodeLabel } ], nextCursor }
GET /api/dramas/{dramaId}                     → { dramaId, slug, title, cover, synopsis, tags, playCount,
                                                  likeCount, episodeCount, latestEpisodeLabel }
GET /api/dramas/{dramaId}/episodes            → { dramaId, episodes: [ { ep, title, playUrl, thumbnailUrl,
                                                  durationSeconds, isPublished, rewardCoins } ] }
    Authorization: Bearer <accessToken> (optional) → each episode also has rewardClaimed
```
- Send the token on the episode list so you can show "earned" / "+15 coins" per episode.
- Signed-out drama and episode responses are cached by the CDN for up to a minute, so a newly
  published episode can take a minute to appear for signed-out viewers.
- Only published dramas, and only published episodes, are returned.
- New per-episode fields: `title` (may be null: show "Episode {ep}"), `thumbnailUrl` (may be null),
  `durationSeconds` (may be null).
- Drama IDs of new dramas never reuse old ones, so episode rewards
  (`POST /api/user/reward/episode {dramaId, ep}`) keep working as before.

## Payouts (redeem) and receipts

```
POST /api/user/redeem?lite=1  { coinsAmount, paymentMethod, accountTitle, accountNumber, bankName? }
→ 200 { success, redemption, ... }                     (coins are deducted now; refunded if rejected)
GET  /api/user/redeem                                   Authorization: Bearer <accessToken>
→ 200 { items: [ { id, coinsAmount, pkrAmount, paymentMethod, accountTitle, accountNumber, bankName,
                   status: "PENDING" | "PAID" | "REJECTED", transactionRef, receiptUrl, adminNotes,
                   createdAt, processedAt } ] }         newest first
```
- **PAID:** show `transactionRef` and the receipt picture from `receiptUrl` (always a JPG / PNG / WebP image).
  The link is signed for that one file and works for at least a day: load it as given, and fetch the list
  again rather than storing the link.
- **REJECTED:** show `adminNotes` (the reason); the coins are already back in the balance.
- **PENDING:** `receiptUrl` and `transactionRef` are `null`.
