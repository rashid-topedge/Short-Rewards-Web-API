/**
 * Coin rewards, all set by the admin (Rewards page) and stored in the
 * database (admin_config.reward_config). Pure helpers only: no database code,
 * so the same validation runs in the API and the admin UI.
 */

export type ReelTier = { upToSeconds: number; coins: number };

/** How reel claims treat the watch token from POST /api/user/reward/reel/start. */
export type WatchTokenMode =
  /** Not needed; reels pay by length as soon as they're claimed. */
  | "off"
  /** Claims with a token pay by length (after the minimum watch time); claims without pay `noTokenCoins` (older app builds). */
  | "optional"
  /** Claims without a valid token are refused. */
  | "required";

export type RewardConfig = {
  /** Coins a new account starts with. */
  signupBonus: number;
  checkIn: {
    /** Coins for day 1, 2, 3… of the streak; the cycle restarts after the last day. */
    streak: number[];
  };
  ad: { coins: number; maxPerDay: number; cooldownSeconds: number };
  episode: { coins: number };
  reel: {
    /** Sorted by upToSeconds; a reel pays the first tier its length fits in. */
    tiers: ReelTier[];
    /** Reels longer than the last tier. */
    longerThanLastTier: number;
    /** Reels whose length isn't known (0). */
    unknownLength: number;
    maxPerDay: number;
    watchTokenMode: WatchTokenMode;
    /** Share of the reel's length that must pass between start and claim. */
    minWatchPercent: number;
    /** Paid for claims without a watch token while mode is "optional". */
    noTokenCoins: number;
  };
  referral: {
    enabled: boolean;
    /** Paid to the person who shared the code. */
    referrerCoins: number;
    /** Paid to the new user. */
    refereeCoins: number;
    /** A code can be entered up to this many days after the account was created. */
    applyWithinDays: number;
    qualify: {
      /** The new user must link a Google account. */
      requireGoogleLink: boolean;
      /** …and earn rewards for this many reels. */
      minReelsWatched: number;
    };
    /** Further qualified referrals wait (pending) and are paid on a later day. */
    maxRewardsPerReferrerPerDay: number;
    /** Lifetime cap per referrer (0 = no limit). */
    maxRewardsPerReferrer: number;
    /** Optional share link; {code} is replaced with the user's code. */
    shareLinkTemplate: string;
  };
};

/** Today's amounts, so nothing changes until the admin edits them. */
export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  signupBonus: 50,
  checkIn: { streak: [10, 20, 30, 50, 70, 100, 200] },
  ad: { coins: 25, maxPerDay: 10, cooldownSeconds: 30 },
  episode: { coins: 15 },
  reel: {
    tiers: [
      { upToSeconds: 30, coins: 3 },
      { upToSeconds: 60, coins: 5 },
      { upToSeconds: 90, coins: 8 },
      { upToSeconds: 120, coins: 10 },
    ],
    longerThanLastTier: 10,
    unknownLength: 5,
    maxPerDay: 20,
    watchTokenMode: "optional",
    minWatchPercent: 80,
    noTokenCoins: 5,
  },
  referral: {
    enabled: true,
    referrerCoins: 100,
    refereeCoins: 50,
    applyWithinDays: 7,
    qualify: { requireGoogleLink: true, minReelsWatched: 5 },
    maxRewardsPerReferrerPerDay: 10,
    maxRewardsPerReferrer: 500,
    shareLinkTemplate: "",
  },
};

const MAX_COINS = 100_000;

type Errors = string[];

function int(value: unknown, path: string, errors: Errors, min: number, max: number): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) {
    errors.push(`${path} must be a whole number`);
    return min;
  }
  if (n < min || n > max) {
    errors.push(`${path} must be between ${min} and ${max}`);
    return Math.min(max, Math.max(min, n));
  }
  return n;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Validates a full config sent by the admin. Missing sections fall back to
 * `base`, so older stored configs pick up new fields with their defaults.
 */
export function parseRewardConfig(
  input: unknown,
  base: RewardConfig = DEFAULT_REWARD_CONFIG
): { ok: true; config: RewardConfig } | { ok: false; errors: string[] } {
  const errors: Errors = [];
  const root = obj(input);
  const pick = (section: Record<string, unknown>, key: string, fallback: unknown) =>
    section[key] === undefined ? fallback : section[key];

  const checkIn = obj(root.checkIn);
  const streakRaw = pick(checkIn, "streak", base.checkIn.streak);
  let streak: number[] = [];
  if (!Array.isArray(streakRaw) || streakRaw.length < 1 || streakRaw.length > 31) {
    errors.push("checkIn.streak must list 1 to 31 days");
  } else {
    streak = streakRaw.map((v, i) => int(v, `checkIn.streak day ${i + 1}`, errors, 0, MAX_COINS));
  }

  const ad = obj(root.ad);
  const episode = obj(root.episode);
  const reel = obj(root.reel);
  const tiersRaw = pick(reel, "tiers", base.reel.tiers);
  let tiers: ReelTier[] = [];
  if (!Array.isArray(tiersRaw) || tiersRaw.length < 1 || tiersRaw.length > 12) {
    errors.push("reel.tiers must have 1 to 12 tiers");
  } else {
    tiers = tiersRaw.map((t, i) => {
      const o = obj(t);
      return {
        upToSeconds: int(o.upToSeconds, `reel tier ${i + 1} length`, errors, 1, 3600),
        coins: int(o.coins, `reel tier ${i + 1} coins`, errors, 0, MAX_COINS),
      };
    });
    tiers.sort((a, b) => a.upToSeconds - b.upToSeconds);
    for (let i = 1; i < tiers.length; i++) {
      if (tiers[i].upToSeconds === tiers[i - 1].upToSeconds) errors.push(`Two reel tiers both end at ${tiers[i].upToSeconds}s`);
    }
  }
  const modeRaw = pick(reel, "watchTokenMode", base.reel.watchTokenMode);
  const watchTokenMode: WatchTokenMode =
    modeRaw === "off" || modeRaw === "optional" || modeRaw === "required" ? modeRaw : "optional";
  if (modeRaw !== watchTokenMode) errors.push("reel.watchTokenMode must be off, optional or required");

  const referral = obj(root.referral);
  const qualify = obj(referral.qualify);
  const template = pick(referral, "shareLinkTemplate", base.referral.shareLinkTemplate);
  if (typeof template !== "string" || template.length > 500) errors.push("referral.shareLinkTemplate must be text");
  else if (template && !/^https?:\/\//.test(template)) errors.push("The share link must start with https://");

  const config: RewardConfig = {
    signupBonus: int(pick(root, "signupBonus", base.signupBonus), "signupBonus", errors, 0, MAX_COINS),
    checkIn: { streak },
    ad: {
      coins: int(pick(ad, "coins", base.ad.coins), "ad.coins", errors, 0, MAX_COINS),
      maxPerDay: int(pick(ad, "maxPerDay", base.ad.maxPerDay), "ad.maxPerDay", errors, 0, 1000),
      cooldownSeconds: int(pick(ad, "cooldownSeconds", base.ad.cooldownSeconds), "ad.cooldownSeconds", errors, 0, 86400),
    },
    episode: { coins: int(pick(episode, "coins", base.episode.coins), "episode.coins", errors, 0, MAX_COINS) },
    reel: {
      tiers,
      longerThanLastTier: int(pick(reel, "longerThanLastTier", base.reel.longerThanLastTier), "reel.longerThanLastTier", errors, 0, MAX_COINS),
      unknownLength: int(pick(reel, "unknownLength", base.reel.unknownLength), "reel.unknownLength", errors, 0, MAX_COINS),
      maxPerDay: int(pick(reel, "maxPerDay", base.reel.maxPerDay), "reel.maxPerDay", errors, 0, 10_000),
      watchTokenMode,
      minWatchPercent: int(pick(reel, "minWatchPercent", base.reel.minWatchPercent), "reel.minWatchPercent", errors, 0, 100),
      noTokenCoins: int(pick(reel, "noTokenCoins", base.reel.noTokenCoins), "reel.noTokenCoins", errors, 0, MAX_COINS),
    },
    referral: {
      enabled: Boolean(pick(referral, "enabled", base.referral.enabled)),
      referrerCoins: int(pick(referral, "referrerCoins", base.referral.referrerCoins), "referral.referrerCoins", errors, 0, MAX_COINS),
      refereeCoins: int(pick(referral, "refereeCoins", base.referral.refereeCoins), "referral.refereeCoins", errors, 0, MAX_COINS),
      applyWithinDays: int(pick(referral, "applyWithinDays", base.referral.applyWithinDays), "referral.applyWithinDays", errors, 0, 365),
      qualify: {
        requireGoogleLink: Boolean(pick(qualify, "requireGoogleLink", base.referral.qualify.requireGoogleLink)),
        minReelsWatched: int(pick(qualify, "minReelsWatched", base.referral.qualify.minReelsWatched), "referral.qualify.minReelsWatched", errors, 0, 1000),
      },
      maxRewardsPerReferrerPerDay: int(
        pick(referral, "maxRewardsPerReferrerPerDay", base.referral.maxRewardsPerReferrerPerDay),
        "referral.maxRewardsPerReferrerPerDay",
        errors,
        0,
        10_000
      ),
      maxRewardsPerReferrer: int(
        pick(referral, "maxRewardsPerReferrer", base.referral.maxRewardsPerReferrer),
        "referral.maxRewardsPerReferrer",
        errors,
        0,
        1_000_000
      ),
      shareLinkTemplate: typeof template === "string" ? template.trim() : "",
    },
  };
  return errors.length ? { ok: false, errors } : { ok: true, config };
}

/** Coins a reel pays by its length (seconds; 0 = unknown). */
export function reelCoinsForDuration(reel: RewardConfig["reel"], durationSeconds: number): number {
  if (!durationSeconds || durationSeconds <= 0) return reel.unknownLength;
  for (const tier of reel.tiers) {
    if (durationSeconds <= tier.upToSeconds) return tier.coins;
  }
  return reel.longerThanLastTier;
}

/** Seconds that must pass between starting and claiming a reel. */
export function minWatchSeconds(reel: RewardConfig["reel"], durationSeconds: number): number {
  if (!durationSeconds || durationSeconds <= 0) return 0;
  return Math.floor((durationSeconds * reel.minWatchPercent) / 100);
}

/** The parts of the config the app may see (GET /api/user/rewards/config). */
export function publicRewardConfig(c: RewardConfig) {
  return {
    signupBonus: c.signupBonus,
    checkIn: { streak: c.checkIn.streak, cycleDays: c.checkIn.streak.length },
    ad: { coins: c.ad.coins, maxPerDay: c.ad.maxPerDay, cooldownSeconds: c.ad.cooldownSeconds },
    episode: { coins: c.episode.coins },
    reel: {
      tiers: c.reel.tiers,
      longerThanLastTier: c.reel.longerThanLastTier,
      unknownLength: c.reel.unknownLength,
      maxPerDay: c.reel.maxPerDay,
      watchTokenMode: c.reel.watchTokenMode,
      minWatchPercent: c.reel.minWatchPercent,
    },
    referral: {
      enabled: c.referral.enabled,
      referrerCoins: c.referral.referrerCoins,
      refereeCoins: c.referral.refereeCoins,
      applyWithinDays: c.referral.applyWithinDays,
      qualify: c.referral.qualify,
    },
  };
}
