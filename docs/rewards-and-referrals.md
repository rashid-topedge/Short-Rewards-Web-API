# Rewards and referrals (admin)

All coin amounts live in the database (`admin_config.reward_config`) and are edited on
**Admin → Rewards**. Each server keeps them in memory for 30 seconds, so a change reaches
every claim within a minute; no redeploy or app update. Each transaction records what was
actually paid, so changing an amount never changes past rewards. Every save is logged in
the Activity log with old → new values. Until the page is first saved, the amounts are the
previous built-in ones (50 welcome, 10/20/30/50/70/100/200 streak, 25 per ad, 15 per
episode, 5 per reel) and the daily limits from Settings.

## Reels by length
- A reel pays the first tier its length fits in (default 30s: 3, 60s: 5, 90s: 8, 120s: 10,
  longer: 10, unknown length: 5). Length comes from the reel record, never from the app;
  reels without a length show "Length?" on the Reels page.
- **Watch-time check** stops instant claims on long reels: the app gets a signed token when a
  reel starts (`/api/user/reward/reel/start`) and the claim only pays after the minimum share
  of the reel's length has passed. Modes:
  - *Off*: pay by length immediately.
  - *On for updated apps* (default): with a token, pay by length after the minimum; without
    one (older app builds), pay the "older app versions" amount (default 5, today's amount).
  - *Required*: claims without a token are refused. Switch to this once everyone has the update.

## Referrals
- Every user gets a 7-character code. A new user can enter one within N days (default 7) of
  creating their account; once only, not their own, not someone they invited.
- Nobody is paid at sign-up. Both are paid together once the new user qualifies (default:
  linked Google **and** earned rewards for 5 reels), in the same database transaction as the
  claim or Google link that completes it, and never twice.
- Caps per inviter: per day (default 10) and lifetime (default 500). Over the cap, referrals
  wait and are paid on a later claim/day.
- **Admin → Referrals** lists them (waiting / paid / rejected), shows top inviters, and lets
  you pay a waiting referral now or reject it.
