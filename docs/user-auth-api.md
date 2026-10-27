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
only on the wallet screen:

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
