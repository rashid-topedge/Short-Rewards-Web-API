import { createClient } from "@libsql/client";

import type {
  DramaCard,
  DramaDetail,
  EpisodeItem,
  UserProfile,
  CoinTransaction,
  CheckInResult,
  RewardResult,
  StreakDayInfo,
  AdminDashboardStats,
  ReelItem,
  ReelListResponse,
  RedemptionRequest,
  RedemptionStatus,
  SystemSettings,
} from "@/lib/types";

// Synchronous-ish facade over the async libSQL client.
// getDb() caches the client once, so call sites stay clean.
type InValue = null | string | number | boolean | Uint8Array;

interface DbApi {
  all(sql: string, args?: (InValue)[]): Promise<unknown[]>;
  get(sql: string, args?: (InValue)[]): Promise<unknown>;
  run(sql: string, args?: (InValue)[]): Promise<{ changes: number; lastInsertRowid: number | bigint }>;
}

interface DramaListRow {
  drama_id: number;
  slug: string;
  title: string | null;
  cover: string | null;
  play_count: number | null;
  episode_count: number | null;
  latest_episode_label: string | null;
  is_published: number;
}

interface DramaDetailRow extends DramaListRow {
  synopsis: string | null;
  tags_json: string | null;
  like_count: number | null;
}

interface EpisodeRow {
  ep: number;
  url: string | null;
  is_published: number;
}

interface ReelRow {
  reel_id: number;
  title: string;
  synopsis: string | null;
  video_url: string;
  thumbnail_url: string | null;
  duration_seconds: number;
  drama_id: number | null;
  drama_title?: string | null;
  episode_number: number | null;
  tags_json: string | null;
  view_count: number;
  like_count: number;
  is_published: number;
  created_at: number;
  updated_at: number;
}

interface UserRow {
  user_id: string;
  coins: number;
  streak_day: number;
  last_check_in_date: string | null;
  created_at: number;
  updated_at: number;
}

interface TransactionRow {
  id: number;
  user_id: string;
  type: string;
  amount: number;
  description: string;
  created_at: string;
}

interface RedemptionRow {
  id: number;
  user_id: string;
  coins_amount: number;
  exchange_rate: number;
  pkr_amount: number;
  payment_method: string;
  account_title: string;
  account_number: string;
  bank_name: string | null;
  status: string;
  transaction_ref: string | null;
  receipt_url: string | null;
  admin_notes: string | null;
  created_at: number;
  processed_at: number | null;
}

const STREAK_REWARDS: Record<number, number> = {
  1: 10,
  2: 20,
  3: 30,
  4: 50,
  5: 70,
  6: 100,
  7: 200,
};

// Cached synchronous facade. The underlying client is created once, lazily.
let dbFacade: DbApi | null = null;

async function getDb(): Promise<DbApi> {
  if (dbFacade) return dbFacade;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error(
      "Missing Turso credentials. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your environment."
    );
  }

  const client = createClient({
    url,
    authToken,
  });

  dbFacade = {
    async all(sql: string, args?: InValue[]): Promise<unknown[]> {
      const { rows } = await client.execute({ sql, args: args || [] });
      return rows as unknown[];
    },
    async get(sql: string, args?: InValue[]): Promise<unknown> {
      const { rows } = await client.execute({ sql, args: args || [] });
      return rows[0];
    },
    async run(sql: string, args?: InValue[]): Promise<{
      changes: number;
      lastInsertRowid: number | bigint;
    }> {
      const result = await client.execute({ sql, args: args || [] });
      return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid ?? 0 };
    },
  };

  // Create the database schema on first connection.
  await createSchema();

  return dbFacade;
}

async function createSchema(): Promise<void> {
  await dbFacade?.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      coins INTEGER NOT NULL DEFAULT 50,
      streak_day INTEGER NOT NULL DEFAULT 0,
      last_check_in_date TEXT,
      created_at REAL NOT NULL,
      updated_at REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coin_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_at REAL NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reels (
      reel_id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      synopsis TEXT,
      video_url TEXT NOT NULL,
      thumbnail_url TEXT,
      duration_seconds INTEGER DEFAULT 0,
      drama_id INTEGER,
      episode_number INTEGER,
      tags_json TEXT DEFAULT '[]',
      view_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 0,
      created_at REAL NOT NULL,
      updated_at REAL NOT NULL,
      FOREIGN KEY (drama_id) REFERENCES dramas(drama_id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS redemption_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      coins_amount INTEGER NOT NULL,
      exchange_rate REAL NOT NULL,
      pkr_amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      account_title TEXT NOT NULL,
      account_number TEXT NOT NULL,
      bank_name TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      transaction_ref TEXT,
      receipt_url TEXT,
      admin_notes TEXT,
      created_at REAL NOT NULL,
      processed_at REAL,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_coin_transactions_user ON coin_transactions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dramas_published ON dramas (is_published, drama_id DESC);
    CREATE INDEX IF NOT EXISTS idx_episodes_published ON episodes (drama_id, is_published, ep ASC);
    CREATE INDEX IF NOT EXISTS idx_reels_published ON reels (is_published, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reels_drama ON reels (drama_id);
    CREATE INDEX IF NOT EXISTS idx_redemptions_status ON redemption_requests(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_redemptions_user ON redemption_requests(user_id, created_at DESC);
  `);
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as unknown[]).map((item) => String(item).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function mapDramaCard(row: DramaListRow): DramaCard {
  return {
    dramaId: row.drama_id,
    slug: row.slug,
    title: row.title,
    cover: row.cover,
    playCount: row.play_count ?? 0,
    episodeCount: row.episode_count ?? 0,
    latestEpisodeLabel: row.latest_episode_label,
    isPublished: Boolean(row.is_published),
  };
}

function mapReelItem(row: ReelRow): ReelItem {
  return {
    reelId: row.reel_id,
    title: row.title,
    synopsis: row.synopsis,
    videoUrl: row.video_url,
    thumbnailUrl: row.thumbnail_url,
    durationSeconds: row.duration_seconds || 0,
    dramaId: row.drama_id,
    dramaTitle: row.drama_title || null,
    episodeNumber: row.episode_number,
    tags: parseTags(row.tags_json),
    viewCount: row.view_count || 0,
    likeCount: row.like_count || 0,
    isPublished: Boolean(row.is_published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRedemptionRequest(row: RedemptionRow): RedemptionRequest {
  return {
    id: row.id,
    userId: row.user_id,
    coinsAmount: row.coins_amount,
    exchangeRate: row.exchange_rate,
    pkrAmount: row.pkr_amount,
    paymentMethod: row.payment_method,
    accountTitle: row.account_title,
    accountNumber: row.account_number,
    bankName: row.bank_name,
    status: row.status as RedemptionStatus,
    transactionRef: row.transaction_ref,
    receiptUrl: row.receipt_url,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    processedAt: row.processed_at,
  };
}

// ==========================================
// SYSTEM SETTINGS
// ==========================================

export async function getSystemSettings(): Promise<SystemSettings> {
  const db = await getDb();
  const rows = await db.all(
    "SELECT key, value FROM system_settings"
  ) as { key: string; value: string }[];
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.key, r.value);
  }

  return {
    coinToPkrRate: parseFloat(map.get("coin_to_pkr_rate") || "0.10"),
    minRedeemCoins: parseInt(map.get("min_redeem_coins") || "500", 10),
    s3Endpoint: map.get("s3_endpoint") || "",
    s3Bucket: map.get("s3_bucket") || "",
    s3AccessKey: map.get("s3_access_key") || "",
    s3SecretKey: map.get("s3_secret_key") || "",
    s3PublicUrl: map.get("s3_public_url") || "",
  };
}

export async function updateSystemSettings(updates: Partial<SystemSettings>): Promise<SystemSettings> {
  const db = await getDb();
  const now = Date.now();

  const fieldMap: Record<string, string | number | undefined> = {
    coin_to_pkr_rate: updates.coinToPkrRate !== undefined ? String(updates.coinToPkrRate) : undefined,
    min_redeem_coins: updates.minRedeemCoins !== undefined ? String(updates.minRedeemCoins) : undefined,
    s3_endpoint: updates.s3Endpoint !== undefined ? updates.s3Endpoint.trim() : undefined,
    s3_bucket: updates.s3Bucket !== undefined ? updates.s3Bucket.trim() : undefined,
    s3_access_key: updates.s3AccessKey !== undefined ? updates.s3AccessKey.trim() : undefined,
    s3_secret_key: updates.s3SecretKey !== undefined ? updates.s3SecretKey.trim() : undefined,
    s3_public_url: updates.s3PublicUrl !== undefined ? updates.s3PublicUrl.trim() : undefined,
  };

  for (const [key, val] of Object.entries(fieldMap)) {
    if (val !== undefined) {
      await db.run(
        `
        INSERT INTO system_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `,
        [key, String(val), now]
      );
    }
  }

  return getSystemSettings();
}

// ==========================================
// PUBLIC DRAMA APIS (Strictly Published Only)
// ==========================================

export async function listDramas(options?: { cursor?: number; limit?: number; query?: string }) {
  const db = await getDb();
  const limit = Math.max(1, Math.min(options?.limit ?? 24, 60));
  const cursor = options?.cursor;
  const query = options?.query?.trim();

  let sql = `
    SELECT drama_id, slug, title, cover, play_count, episode_count, latest_episode_label, is_published
    FROM dramas
    WHERE is_published = 1
  `;
  const params: unknown[] = [];

  if (query) {
    sql += ` AND (title LIKE ? OR synopsis LIKE ?)`;
    params.push(`%${query}%`, `%${query}%`);
  }

  if (cursor !== undefined) {
    sql += ` AND drama_id < ?`;
    params.push(cursor);
  }

  sql += ` ORDER BY drama_id DESC LIMIT ?`;
  params.push(limit + 1);

  const rows = (await db.all(sql, params as InValue[])) as DramaListRow[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? String(items[items.length - 1].drama_id) : null;

  return {
    limit,
    nextCursor,
    items: items.map(mapDramaCard),
  };
}

export async function getDrama(dramaId: number, includeUnpublished = false): Promise<DramaDetail | null> {
  const db = await getDb();
  let sql = `
    SELECT drama_id, slug, title, cover, synopsis, tags_json, play_count, like_count, episode_count, latest_episode_label, is_published
    FROM dramas
    WHERE drama_id = ?
  `;
  if (!includeUnpublished) {
    sql += ` AND is_published = 1`;
  }

  const row = await db.get(sql, [dramaId]) as DramaDetailRow | undefined;
  if (!row) return null;

  return {
    dramaId: row.drama_id,
    slug: row.slug,
    title: row.title,
    cover: row.cover,
    synopsis: row.synopsis,
    tags: parseTags(row.tags_json),
    playCount: row.play_count ?? 0,
    likeCount: row.like_count ?? 0,
    episodeCount: row.episode_count ?? 0,
    latestEpisodeLabel: row.latest_episode_label,
    isPublished: Boolean(row.is_published),
  };
}

export async function listEpisodes(dramaId: number, includeUnpublished = false): Promise<EpisodeItem[]> {
  const db = await getDb();
  let sql = `
    SELECT ep, url, is_published
    FROM episodes
    WHERE drama_id = ?
  `;
  if (!includeUnpublished) {
    sql += ` AND is_published = 1`;
  }
  sql += ` ORDER BY ep ASC`;

  const rows = await db.all(sql, [dramaId]) as EpisodeRow[];
  return rows.map((row) => ({
    ep: row.ep,
    playUrl: row.url,
    isPublished: Boolean(row.is_published),
  }));
}

// ==========================================
// PUBLIC REELS APIS (Strictly Published Only)
// ==========================================

export async function listReels(options?: {
  cursor?: number;
  limit?: number;
  dramaId?: number;
  sort?: "newest" | "trending" | "random";
}) {
  const db = await getDb();
  const limit = Math.max(1, Math.min(options?.limit ?? 10, 50));
  const cursor = options?.cursor;
  const dramaId = options?.dramaId;
  const sort = options?.sort || "newest";

  let sql = `
    SELECT r.reel_id, r.title, r.synopsis, r.video_url, r.thumbnail_url, r.duration_seconds,
           r.drama_id, d.title as drama_title, r.episode_number, r.tags_json, r.view_count,
           r.like_count, r.is_published, r.created_at, r.updated_at
    FROM reels r
    LEFT JOIN dramas d ON r.drama_id = d.drama_id
    WHERE r.is_published = 1
  `;
  const params: unknown[] = [];

  if (dramaId) {
    sql += ` AND r.drama_id = ?`;
    params.push(dramaId);
  }

  if (cursor !== undefined && sort !== "random") {
    sql += ` AND r.reel_id < ?`;
    params.push(cursor);
  }

  if (sort === "trending") {
    sql += ` ORDER BY (r.view_count * 2 + r.like_count * 5) DESC, r.reel_id DESC`;
  } else if (sort === "random") {
    sql += ` ORDER BY RANDOM()`;
  } else {
    sql += ` ORDER BY r.reel_id DESC`;
  }

  sql += ` LIMIT ?`;
  params.push(limit + 1);

  const rows = (await db.all(sql, params as InValue[])) as ReelRow[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? String(items[items.length - 1].reel_id) : null;

  return {
    limit,
    nextCursor,
    items: items.map(mapReelItem),
  };
}

export async function getReel(reelId: number, includeUnpublished = false): Promise<ReelItem | null> {
  const db = await getDb();
  let sql = `
    SELECT r.reel_id, r.title, r.synopsis, r.video_url, r.thumbnail_url, r.duration_seconds,
           r.drama_id, d.title as drama_title, r.episode_number, r.tags_json, r.view_count,
           r.like_count, r.is_published, r.created_at, r.updated_at
    FROM reels r
    LEFT JOIN dramas d ON r.drama_id = d.drama_id
    WHERE r.reel_id = ?
  `;
  if (!includeUnpublished) {
    sql += ` AND r.is_published = 1`;
  }

  const row = await db.get(sql, [reelId]) as ReelRow | undefined;
  if (!row) return null;
  return mapReelItem(row);
}

export async function incrementReelViews(reelId: number): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE reels SET view_count = view_count + 1 WHERE reel_id = ?", [reelId]);
}

export async function incrementReelLikes(reelId: number): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE reels SET like_count = like_count + 1 WHERE reel_id = ?", [reelId]);
}

// ==========================================
// USER & ECONOMY QUERIES
// ==========================================

function getTodayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export async function getOrCreateUser(userId: string, todayIso: string = getTodayIso()): Promise<UserProfile> {
  const db = await getDb();
  const now = Date.now();

  let userRow = (await db.get(
    "SELECT * FROM users WHERE user_id = ?",
    [userId]
  )) as UserRow | undefined;

  if (!userRow) {
    await db.run(
      `
      INSERT INTO users (user_id, coins, streak_day, last_check_in_date, created_at, updated_at)
      VALUES (?, 50, 0, NULL, ?, ?)
    `,
      [userId, now, now]
    );

    await db.run(
      `
      INSERT INTO coin_transactions (user_id, type, amount, description, created_at)
      VALUES (?, 'SIGNUP_BONUS', 50, 'Welcome bonus coins!', ?)
    `,
      [userId, now]
    );

    userRow = (await db.get(
      "SELECT * FROM users WHERE user_id = ?",
      [userId]
    )) as UserRow;
  }

  return formatUserProfile(userRow, todayIso);
}

async function formatUserProfile(userRow: UserRow, todayIso: string): Promise<UserProfile> {
  const db = await getDb();
  const canCheckInToday = userRow.last_check_in_date !== todayIso;
  const currentStreak = userRow.streak_day;
  const nextDay = currentStreak >= 7 ? 1 : currentStreak + 1;
  const nextReward = STREAK_REWARDS[nextDay] || 10;

  const streakSchedule: StreakDayInfo[] = [1, 2, 3, 4, 5, 6, 7].map((day) => {
    let status: "claimed" | "available" | "locked" = "locked";
    if (day <= currentStreak) {
      status = "claimed";
    } else if (day === nextDay && canCheckInToday) {
      status = "available";
    }
    return {
      day,
      coins: STREAK_REWARDS[day],
      status,
    };
  });

  return db.all(
    `
    SELECT id, user_id, type, amount, description, created_at
    FROM coin_transactions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 30
  `,
    [userRow.user_id]
  ).then((txRows: unknown[]) => {
    // const transactions: CoinTransaction[] = txRows.map(
    //   (t: Record<string, unknown>) => ({
    //     id: t.id,
    //     userId: t.user_id,
    //     type: t.type as CoinTransaction["type"],
    //     amount: t.amount,
    //     description: t.description,
    //     createdAt: t.created_at,
    //   })
    // );

    const transactions: CoinTransaction[] = txRows.map(
      (row: unknown) => {
        if (typeof row !== "object" || row === null) {
          throw new Error("Invalid coin transaction row");
        }

        const t = row as Record<string, unknown>;

        if (
          typeof t.id !== "number" ||
          typeof t.user_id !== "string" ||
          typeof t.amount !== "number" ||
          typeof t.description !== "string" ||
          typeof t.created_at !== "string" ||
          typeof t.type !== "string"
        ) {
          throw new Error("Invalid coin transaction fields");
        }

        const validTypes: CoinTransaction["type"][] = [
          "DAILY_CHECKIN",
          "EPISODE_WATCHED",
          "REWARD_AD",
          "REEL_WATCHED",
          "SIGNUP_BONUS",
          "SPEND",
          "ADMIN_ADJUSTMENT",
        ];

        if (!validTypes.includes(t.type as CoinTransaction["type"])) {
          throw new Error("Invalid coin transaction type");
        }

        return {
          id: t.id,
          userId: t.user_id,
          type: t.type as CoinTransaction["type"],
          amount: t.amount,
          description: t.description,
          createdAt: t.created_at,
        };
      }
    );

    return {
      userId: userRow.user_id,
      coins: userRow.coins,
      streakDay: userRow.streak_day,
      lastCheckInDate: userRow.last_check_in_date,
      canCheckInToday,
      nextCheckInReward: nextReward,
      streakSchedule,
      transactions,
    };
  });
}

export async function performDailyCheckIn(
  userId: string,
  todayIso?: string
): Promise<CheckInResult> {
  const db = await getDb();
  const today = todayIso || getTodayIso();
  const now = Date.now();

  const user = await getOrCreateUser(userId, today);
  if (!user.canCheckInToday) {
    return {
      success: false,
      message: "You have already claimed today's check-in bonus!",
      coinsEarned: 0,
      newCoinsBalance: user.coins,
      streakDay: user.streakDay,
      isCycleReset: false,
      user,
    };
  }

  let newStreak = user.streakDay + 1;
  let isCycleReset = false;
  if (newStreak > 7) {
    newStreak = 1;
    isCycleReset = true;
  }

  const rewardCoins = STREAK_REWARDS[newStreak] || 10;
  const newBalance = user.coins + rewardCoins;

  await db.run(
    `
    UPDATE users
    SET coins = ?, streak_day = ?, last_check_in_date = ?, updated_at = ?
    WHERE user_id = ?
  `,
    [newBalance, newStreak, today, now, userId]
  );

  const desc = isCycleReset
    ? `Completed 7-day cycle! Day 1 Bonus: +${rewardCoins} coins`
    : `Day ${newStreak} Daily Check-in: +${rewardCoins} coins`;

  await db.run(
    `
    INSERT INTO coin_transactions (user_id, type, amount, description, created_at)
    VALUES (?, 'DAILY_CHECKIN', ?, ?, ?)
  `,
    [userId, rewardCoins, desc, now]
  );

  const updatedUser = await getOrCreateUser(userId, today);

  return {
    success: true,
    message: isCycleReset
      ? `Congratulations! 7-day cycle completed. You earned ${rewardCoins} coins and streak has reset!`
      : `Day ${newStreak} check-in claimed! +${rewardCoins} coins added.`,
    coinsEarned: rewardCoins,
    newCoinsBalance: newBalance,
    streakDay: newStreak,
    isCycleReset,
    user: updatedUser,
  };
}

export async function awardRewardedAd(
  userId: string,
  adType: string = "REWARDED_VIDEO",
  todayIso?: string
): Promise<RewardResult> {
  const db = await getDb();
  const today = todayIso || getTodayIso();
  const now = Date.now();

  const user = await getOrCreateUser(userId, today);
  const rewardCoins = 25;
  const newBalance = user.coins + rewardCoins;

  await db.run(
    `
    UPDATE users
    SET coins = ?, updated_at = ?
    WHERE user_id = ?
  `,
    [newBalance, now, userId]
  );

  await db.run(
    `
    INSERT INTO coin_transactions (user_id, type, amount, description, created_at)
    VALUES (?, 'REWARD_AD', ?, ?, ?)
  `,
    [userId, rewardCoins, `Watched Sponsored Video Ad (${adType})`, now]
  );

  const updatedUser = await getOrCreateUser(userId, today);

  return {
    success: true,
    message: `Watched reward ad successfully! +${rewardCoins} coins added.`,
    coinsEarned: rewardCoins,
    newCoinsBalance: newBalance,
    user: updatedUser,
  };
}

export async function awardEpisodeWatched(
  userId: string,
  dramaId: number,
  ep: number,
  todayIso?: string
): Promise<RewardResult> {
  const db = await getDb();
  const today = todayIso || getTodayIso();
  const now = Date.now();
  const description = `Watched episode ${ep} of drama #${dramaId}`;

  const existing = (await db.get(
    `
    SELECT id FROM coin_transactions
    WHERE user_id = ? AND type = 'EPISODE_WATCHED' AND description = ?
    LIMIT 1
  `,
    [userId, description]
  )) as { id: number } | undefined;

  const user = await getOrCreateUser(userId, today);
  if (existing) {
    return {
      success: true,
      message: "Episode reward already claimed.",
      coinsEarned: 0,
      newCoinsBalance: user.coins,
      user,
    };
  }

  const rewardCoins = 15;
  const newBalance = user.coins + rewardCoins;

  await db.run(
    `
    UPDATE users
    SET coins = ?, updated_at = ?
    WHERE user_id = ?
  `,
    [newBalance, now, userId]
  );

  await db.run(
    `
    INSERT INTO coin_transactions (user_id, type, amount, description, created_at)
    VALUES (?, 'EPISODE_WATCHED', ?, ?, ?)
  `,
    [userId, rewardCoins, description, now]
  );

  const updatedUser = await getOrCreateUser(userId, today);
  return {
    success: true,
    message: `Finished episode ${ep}! +${rewardCoins} coins added.`,
    coinsEarned: rewardCoins,
    newCoinsBalance: newBalance,
    user: updatedUser,
  };
}

export async function awardReelWatched(
  userId: string,
  reelId: number,
  todayIso?: string
): Promise<RewardResult> {
  const db = await getDb();
  const today = todayIso || getTodayIso();
  const now = Date.now();

  const user = await getOrCreateUser(userId, today);
  const rewardCoins = 5;
  const newBalance = user.coins + rewardCoins;

  await db.run(
    `
    UPDATE users
    SET coins = ?, updated_at = ?
    WHERE user_id = ?
  `,
    [newBalance, now, userId]
  );

  await db.run(
    `
    INSERT INTO coin_transactions (user_id, type, amount, description, created_at)
    VALUES (?, 'REEL_WATCHED', ?, ?, ?)
  `,
    [userId, rewardCoins, `Watched Short Reel #${reelId}`, now]
  );

  const updatedUser = await getOrCreateUser(userId, today);

  return {
    success: true,
    message: `Watched short reel! +${rewardCoins} coins added.`,
    coinsEarned: rewardCoins,
    newCoinsBalance: newBalance,
    user: updatedUser,
  };
}

// ==========================================
// REDEMPTIONS & PAYMENT SYSTEM
// ==========================================

export async function createRedemptionRequest(data: {
  userId: string;
  coinsAmount: number;
  paymentMethod: string;
  accountTitle: string;
  accountNumber: string;
  bankName?: string;
}): Promise<{ success: boolean; message: string; redemption?: RedemptionRequest; user?: UserProfile }> {
  const db = await getDb();
  const now = Date.now();
  const settings = await getSystemSettings();
  const user = await getOrCreateUser(data.userId);

  if (data.coinsAmount < settings.minRedeemCoins) {
    return {
      success: false,
      message: `Minimum redemption threshold is ${settings.minRedeemCoins} coins (${(settings.minRedeemCoins * settings.coinToPkrRate).toFixed(2)} PKR).`,
      user,
    };
  }

  if (user.coins < data.coinsAmount) {
    return {
      success: false,
      message: `Insufficient coin balance. You have ${user.coins} coins, but requested ${data.coinsAmount}.`,
      user,
    };
  }

  const exchangeRate = settings.coinToPkrRate;
  const pkrAmount = Math.round(data.coinsAmount * exchangeRate * 100) / 100;
  const newBalance = user.coins - data.coinsAmount;

  // Deduct coins immediately
  await db.run("UPDATE users SET coins = ?, updated_at = ? WHERE user_id = ?", [newBalance, now, data.userId]);

  // Record SPEND ledger transaction
  await db.run(
    `
    INSERT INTO coin_transactions (user_id, type, amount, description, created_at)
    VALUES (?, 'SPEND', ?, ?, ?)
  `,
    [
      data.userId,
      -data.coinsAmount,
      `Redemption Request: ${data.coinsAmount} coins for ${pkrAmount} PKR via ${data.paymentMethod}`,
      now,
    ]
  );

  // Insert redemption record
  await db.run(
    `
      INSERT INTO redemption_requests (
        user_id, coins_amount, exchange_rate, pkr_amount,
        payment_method, account_title, account_number, bank_name,
        status, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `,
    [
      data.userId,
      data.coinsAmount,
      exchangeRate,
      pkrAmount,
      data.paymentMethod.trim(),
      data.accountTitle.trim(),
      data.accountNumber.trim(),
      data.bankName?.trim() || null,
      now,
    ]
  );

  // Drop user_episode_rewards table if it exists (badge/back-end episode rewards retired)
  try {
    await db.run(`DROP TABLE IF EXISTS user_episode_rewards;`);
  } catch { }

  const row = await db.get(
    "SELECT * FROM redemption_requests ORDER BY id DESC LIMIT 1"
  ) as RedemptionRow;
  const updatedUser = await getOrCreateUser(data.userId);

  return {
    success: true,
    message: `Redemption request submitted successfully for ${pkrAmount} PKR. An admin will review and process your payout.`,
    redemption: mapRedemptionRequest(row),
    user: updatedUser,
  };
}

export async function listUserRedemptions(userId: string): Promise<RedemptionRequest[]> {
  const db = await getDb();
  const rows = await db.all(
    `
    SELECT * FROM redemption_requests
    WHERE user_id = ?
    ORDER BY created_at DESC
  `,
    [userId]
  ) as RedemptionRow[];

  return rows.map(mapRedemptionRequest);
}

export async function listRedemptionsAdmin(options: {
  status?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; limit: number; offset: number; items: RedemptionRequest[] }> {
  const db = await getDb();
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const offset = Math.max(0, options.offset ?? 0);

  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (options.status && options.status !== "all") {
    whereClauses.push("status = ?");
    params.push(options.status.toUpperCase());
  }

  if (options.userId?.trim()) {
    whereClauses.push("user_id LIKE ?");
    params.push(`%${options.userId.trim()}%`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const countRow = (await db.get(
    `SELECT COUNT(*) as count FROM redemption_requests ${whereSql}`,
    params as InValue[]
  )) as { count: number };
  const total = countRow.count;

  const sql = `
    SELECT * FROM redemption_requests
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await db.all(sql, params.concat([limit, offset]) as InValue[]) as RedemptionRow[];

  return {
    total,
    limit,
    offset,
    items: rows.map(mapRedemptionRequest),
  };
}

export async function processRedemptionAdmin(
  id: number,
  data: {
    action: "PAID" | "REJECTED";
    transactionRef?: string;
    receiptUrl?: string;
    adminNotes?: string;
  }
): Promise<{ success: boolean; message: string; redemption?: RedemptionRequest }> {
  const db = await getDb();
  const now = Date.now();

  const existing = (await db.get("SELECT * FROM redemption_requests WHERE id = ?", [id])) as
    | RedemptionRow
    | undefined;
  if (!existing) {
    return { success: false, message: "Redemption request not found" };
  }

  if (existing.status !== "PENDING") {
    return { success: false, message: `Request is already ${existing.status}` };
  }

  if (data.action === "PAID") {
    if (!data.transactionRef?.trim()) {
      return { success: false, message: "Transaction ID / Reference is mandatory when marking as PAID." };
    }
    if (!data.receiptUrl?.trim()) {
      return { success: false, message: "Receipt screenshot URL is mandatory when marking as PAID." };
    }

    await db.run(
      `
      UPDATE redemption_requests
      SET status = 'PAID',
          transaction_ref = ?,
          receipt_url = ?,
          admin_notes = ?,
          processed_at = ?
      WHERE id = ?
    `,
      [
        data.transactionRef.trim(),
        data.receiptUrl.trim(),
        data.adminNotes?.trim() || null,
        now,
        id,
      ]
    );
  } else if (data.action === "REJECTED") {
    // Refund coins back to user
    const user = await getOrCreateUser(existing.user_id);
    const refundedBalance = user.coins + existing.coins_amount;

    await db.run(
      "UPDATE users SET coins = ?, updated_at = ? WHERE user_id = ?",
      [refundedBalance, now, existing.user_id]
    );

    // Record refund transaction
    await db.run(
      `
      INSERT INTO coin_transactions (user_id, type, amount, description, created_at)
      VALUES (?, 'ADMIN_ADJUSTMENT', ?, ?, ?)
    `,
      [
        existing.user_id,
        existing.coins_amount,
        `Refund for Rejected Redemption #${id}: ${data.adminNotes || "Rejected by administrator"}`,
        now,
      ]
    );

    await db.run(
      `
      UPDATE redemption_requests
      SET status = 'REJECTED',
          admin_notes = ?,
          processed_at = ?
      WHERE id = ?
    `,
      [data.adminNotes?.trim() || null, now, id]
    );
  }

  const updated = (await db.get("SELECT * FROM redemption_requests WHERE id = ?", [id])) as RedemptionRow;
  return {
    success: true,
    message: `Redemption #${id} marked as ${data.action} successfully`,
    redemption: mapRedemptionRequest(updated),
  };
}

// ==========================================
// ADMIN DASHBOARD & CRUD QUERIES
// ==========================================

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const db = await getDb();
  const today = getTodayIso();

  const dramasRow = (await db.get(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_published = 1 THEN 1 ELSE 0 END) as published,
      SUM(CASE WHEN is_published = 0 THEN 1 ELSE 0 END) as draft
    FROM dramas
  `)) as { total: number; published: number; draft: number };

  const epRow = (await db.get(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_published = 1 THEN 1 ELSE 0 END) as published
    FROM episodes
  `)) as { total: number; published: number };

  const reelsRow = (await db.get(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_published = 1 THEN 1 ELSE 0 END) as published,
      SUM(CASE WHEN is_published = 0 THEN 1 ELSE 0 END) as draft
    FROM reels
  `)) as { total: number; published: number; draft: number };

  const usersRow = (await db.get(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(coins), 0) as totalCoins,
      SUM(CASE WHEN streak_day > 0 THEN 1 ELSE 0 END) as activeStreaks
    FROM users
  `)) as { total: number; totalCoins: number; activeStreaks: number };

  const txCountRow = (await db.get("SELECT COUNT(*) as count FROM coin_transactions")) as {
    count: number;
  };

  // Redemptions stats
  const redemptionsRow = (await db.get(`
    SELECT
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pendingCount,
      COALESCE(SUM(CASE WHEN status = 'PENDING' THEN pkr_amount ELSE 0 END), 0) as pendingPkr,
      COALESCE(SUM(CASE WHEN status = 'PAID' THEN pkr_amount ELSE 0 END), 0) as paidPkr
    FROM redemption_requests
  `)) as { pendingCount: number; pendingPkr: number; paidPkr: number };

  const recentTxRows = (await db.all(`
    SELECT id, user_id, type, amount, description, created_at
    FROM coin_transactions
    ORDER BY created_at DESC
    LIMIT 10
  `)) as TransactionRow[];

  const recentUserRows = (await db.all(`
    SELECT * FROM users
    ORDER BY updated_at DESC
    LIMIT 8
  `)) as UserRow[];

  return {
    totalDramas: dramasRow?.total || 0,
    publishedDramas: dramasRow?.published || 0,
    draftDramas: dramasRow?.draft || 0,
    totalEpisodes: epRow?.total || 0,
    publishedEpisodes: epRow?.published || 0,
    totalReels: reelsRow?.total || 0,
    publishedReels: reelsRow?.published || 0,
    draftReels: reelsRow?.draft || 0,
    totalUsers: usersRow?.total || 0,
    totalCoinsInCirculation: usersRow?.totalCoins || 0,
    totalTransactions: txCountRow?.count || 0,
    activeStreaksCount: usersRow?.activeStreaks || 0,
    pendingRedemptionsCount: redemptionsRow?.pendingCount || 0,
    pendingRedemptionsPkr: redemptionsRow?.pendingPkr || 0,
    totalPaidPkr: redemptionsRow?.paidPkr || 0,
    recentTransactions: recentTxRows.map((t) => ({
      id: t.id,
      userId: t.user_id,
      type: t.type as CoinTransaction["type"],
      amount: t.amount,
      description: t.description,
      createdAt: t.created_at,
    })),
    recentUsers: await Promise.all(
      recentUserRows.map((u) => formatUserProfile(u, today))
    ),
  };
}

export async function listDramasAdmin(options: {
  query?: string;
  status?: "all" | "published" | "draft";
  limit?: number;
  offset?: number;
}): Promise<{ total: number; limit: number; offset: number; items: DramaCard[] }> {
  const db = await getDb();
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const query = options.query?.trim();
  const status = options.status || "all";

  let whereClauses: string[] = [];
  const params: unknown[] = [];

  if (query) {
    whereClauses.push("(title LIKE ? OR synopsis LIKE ? OR slug LIKE ?)");
    params.push(`%${query}%`, `%${query}%`, `%${query}%`);
  }

  if (status === "published") {
    whereClauses.push("is_published = 1");
  } else if (status === "draft") {
    whereClauses.push("is_published = 0");
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const countRow = (await db.get(
    `SELECT COUNT(*) as count FROM dramas ${whereSql}`,
    params as InValue[]
  )) as { count: number };
  const total = countRow.count;

  const sql = `
    SELECT drama_id, slug, title, cover, play_count, episode_count, latest_episode_label, is_published
    FROM dramas
    ${whereSql}
    ORDER BY drama_id DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await db.all(sql, params.concat([limit, offset]) as InValue[]) as DramaListRow[];

  return {
    total,
    limit,
    offset,
    items: rows.map(mapDramaCard),
  };
}

export async function createDramaAdmin(data: {
  title: string;
  slug?: string;
  cover?: string;
  synopsis?: string;
  tags?: string[];
  playCount?: number;
  likeCount?: number;
  episodeCount?: number;
  latestEpisodeLabel?: string;
  isPublished?: boolean;
}): Promise<DramaCard> {
  const db = await getDb();
  const slug =
    (data.slug?.trim() ||
      data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) +
    "-" +
    Date.now().toString().slice(-4);
  const tagsJson = JSON.stringify(data.tags ?? []);
  const now = Date.now();
  const isPublishedVal = data.isPublished ? 1 : 0;

  await db.run(
    `
    INSERT INTO dramas (
      slug, title, cover, synopsis, tags_json,
      play_count, like_count, episode_count, latest_episode_label,
      is_published, raw_json, fetched_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, datetime('now'), datetime('now'))
  `,
    [
      slug,
      data.title.trim(),
      data.cover?.trim() || null,
      data.synopsis?.trim() || null,
      tagsJson,
      data.playCount ?? 0,
      data.likeCount ?? 0,
      data.episodeCount ?? 0,
      data.latestEpisodeLabel?.trim() || null,
      isPublishedVal,
      now,
    ]
  );

  const row = (await db.get("SELECT * FROM dramas WHERE slug = ?", [slug])) as DramaDetailRow;
  return mapDramaCard(row);
}

export async function updateDramaAdmin(
  dramaId: number,
  data: {
    title?: string;
    cover?: string;
    synopsis?: string;
    tags?: string[];
    playCount?: number;
    likeCount?: number;
    episodeCount?: number;
    latestEpisodeLabel?: string;
    isPublished?: boolean;
  }
): Promise<DramaDetail | null> {
  const db = await getDb();
  const existing = await getDrama(dramaId, true);
  if (!existing) return null;

  const updates: string[] = ["updated_at = ?"];
  const params: unknown[] = [Date.now()];

  if (data.title !== undefined) {
    updates.push("title = ?");
    params.push(data.title.trim());
  }
  if (data.cover !== undefined) {
    updates.push("cover = ?");
    params.push(data.cover.trim() || null);
  }
  if (data.synopsis !== undefined) {
    updates.push("synopsis = ?");
    params.push(data.synopsis.trim() || null);
  }
  if (data.tags !== undefined) {
    updates.push("tags_json = ?");
    params.push(JSON.stringify(data.tags));
  }
  if (data.playCount !== undefined) {
    updates.push("play_count = ?");
    params.push(data.playCount);
  }
  if (data.likeCount !== undefined) {
    updates.push("like_count = ?");
    params.push(data.likeCount);
  }
  if (data.episodeCount !== undefined) {
    updates.push("episode_count = ?");
    params.push(data.episodeCount);
  }
  if (data.latestEpisodeLabel !== undefined) {
    updates.push("latest_episode_label = ?");
    params.push(data.latestEpisodeLabel.trim() || null);
  }
  if (data.isPublished !== undefined) {
    updates.push("is_published = ?");
    params.push(data.isPublished ? 1 : 0);
  }

  params.push(dramaId);
  await db.run(`UPDATE dramas SET ${updates.join(", ")} WHERE drama_id = ?`, params as InValue[]);

  return getDrama(dramaId, true);
}

export async function deleteDramaAdmin(dramaId: number): Promise<boolean> {
  const db = await getDb();
  await db.run("DELETE FROM episodes WHERE drama_id = ?", [dramaId]);
  await db.run("DELETE FROM reels WHERE drama_id = ?", [dramaId]);
  await db.run("DELETE FROM dramas WHERE drama_id = ?", [dramaId]);
  return true;
}

export async function bulkUpdateDramasPublish(
  dramaIds: number[],
  isPublished: boolean
): Promise<number> {
  if (!dramaIds || dramaIds.length === 0) return 0;
  const db = await getDb();
  const placeholders = dramaIds.map(() => "?").join(",");
  const pubVal = isPublished ? 1 : 0;
  await db.run(
    `UPDATE dramas SET is_published = ?, updated_at = datetime('now') WHERE drama_id IN (${placeholders})`,
    [pubVal, ...dramaIds] as InValue[]
  );
  await db.run(
    `UPDATE episodes SET is_published = ? WHERE drama_id IN (${placeholders})`,
    [pubVal, ...dramaIds] as InValue[]
  );
  return dramaIds.length;
}

export async function bulkUpdateAllDramasPublish(
  isPublished: boolean,
  onlyWithEpisodes = false
): Promise<number> {
  const db = await getDb();
  const pubVal = isPublished ? 1 : 0;
  let sql = `UPDATE dramas SET is_published = ?, updated_at = datetime('now')`;
  if (onlyWithEpisodes) {
    sql += ` WHERE episode_count > 0 OR drama_id IN (SELECT DISTINCT drama_id FROM episodes WHERE url IS NOT NULL AND url != '')`;
  }
  await db.run(sql, [pubVal] as InValue[]);
  await db.run(`UPDATE episodes SET is_published = ?`, [pubVal] as InValue[]);
  return 1;
}

export async function saveEpisodeAdmin(
  dramaId: number,
  ep: number,
  url: string,
  isPublished = true
): Promise<EpisodeItem[]> {
  const db = await getDb();
  const now = Date.now();
  const pubVal = isPublished ? 1 : 0;

  await db.run(
    `
    INSERT INTO episodes (drama_id, ep, url, is_published, source, raw_json, fetched_at)
    VALUES (?, ?, ?, ?, 1, '{}', ?)
    ON CONFLICT(drama_id, ep) DO UPDATE SET url = excluded.url, is_published = excluded.is_published, fetched_at = excluded.fetched_at
  `,
    [dramaId, ep, url.trim(), pubVal, now]
  );

  const countRow = (await db.get(
    "SELECT COUNT(*) as count FROM episodes WHERE drama_id = ?",
    [dramaId]
  )) as { count: number };
  await db.run(
    `
    UPDATE dramas
    SET episode_count = ?, latest_episode_label = 'EP ' || ?, updated_at = datetime('now')
    WHERE drama_id = ?
  `,
    [countRow.count, ep, dramaId]
  );

  return listEpisodes(dramaId, true);
}

export async function updateEpisodePublishAdmin(
  dramaId: number,
  ep: number,
  isPublished: boolean
): Promise<EpisodeItem[]> {
  const db = await getDb();
  const pubVal = isPublished ? 1 : 0;
  await db.run("UPDATE episodes SET is_published = ? WHERE drama_id = ? AND ep = ?", [
    pubVal,
    dramaId,
    ep,
  ]);
  return listEpisodes(dramaId, true);
}

export async function deleteEpisodeAdmin(dramaId: number, ep: number): Promise<EpisodeItem[]> {
  const db = await getDb();
  await db.run("DELETE FROM episodes WHERE drama_id = ? AND ep = ?", [dramaId, ep]);

  const countRow = (await db.get(
    "SELECT COUNT(*) as count FROM episodes WHERE drama_id = ?",
    [dramaId]
  )) as { count: number };
  await db.run(
    `
    UPDATE dramas
    SET episode_count = ?, updated_at = datetime('now')
    WHERE drama_id = ?
  `,
    [countRow.count, dramaId]
  );

  return listEpisodes(dramaId, true);
}

// ==========================================
// REELS ADMIN CRUD
// ==========================================

export async function listReelsAdmin(options: {
  query?: string;
  status?: "all" | "published" | "draft";
  dramaId?: number;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; limit: number; offset: number; items: ReelItem[] }> {
  const db = await getDb();
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const query = options.query?.trim();
  const status = options.status || "all";
  const dramaId = options.dramaId;

  let whereClauses: string[] = [];
  const params: unknown[] = [];

  if (query) {
    whereClauses.push("(r.title LIKE ? OR r.synopsis LIKE ? OR d.title LIKE ?)");
    params.push(`%${query}%`, `%${query}%`, `%${query}%`);
  }

  if (status === "published") {
    whereClauses.push("r.is_published = 1");
  } else if (status === "draft") {
    whereClauses.push("r.is_published = 0");
  }

  if (dramaId) {
    whereClauses.push("r.drama_id = ?");
    params.push(dramaId);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const countRow = (await db.get(`
    SELECT COUNT(*) as count
    FROM reels r
    LEFT JOIN dramas d ON r.drama_id = d.drama_id
    ${whereSql}
  `, params as InValue[])) as { count: number };
  const total = countRow.count;

  const sql = `
    SELECT r.reel_id, r.title, r.synopsis, r.video_url, r.thumbnail_url, r.duration_seconds,
           r.drama_id, d.title as drama_title, r.episode_number, r.tags_json, r.view_count,
           r.like_count, r.is_published, r.created_at, r.updated_at
    FROM reels r
    LEFT JOIN dramas d ON r.drama_id = d.drama_id
    ${whereSql}
    ORDER BY r.reel_id DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await db.all(sql, params.concat([limit, offset]) as InValue[]) as ReelRow[];

  return {
    total,
    limit,
    offset,
    items: rows.map(mapReelItem),
  };
}


export async function createReelAdmin(data: {
  title: string;
  synopsis?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  dramaId?: number | null;
  episodeNumber?: number | null;
  tags?: string[];
  isPublished?: boolean;
}): Promise<ReelItem> {
  const db = await getDb();
  const now = Date.now();
  const tagsJson = JSON.stringify(data.tags ?? []);
  const pubVal = data.isPublished ? 1 : 0;

  await db.run(
    `
      INSERT INTO reels (
        title, synopsis, video_url, thumbnail_url, duration_seconds,
        drama_id, episode_number, tags_json, view_count, like_count,
        is_published, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
    `,
    [
      data.title.trim(),
      data.synopsis?.trim() || null,
      data.videoUrl.trim(),
      data.thumbnailUrl?.trim() || null,
      data.durationSeconds ?? 0,
      data.dramaId ?? null,
      data.episodeNumber ?? null,
      tagsJson,
      pubVal,
      now,
      now,
    ]
  );

  const row = (await db.get(
    "SELECT * FROM reels ORDER BY reel_id DESC LIMIT 1"
  )) as ReelRow | null;

  if (!row) {
    throw new Error("Reel created, but could not retrieve its record");
  }

  const reel = await getReel(row.reel_id, true);

  if (!reel) {
    throw new Error("Reel created, but could not load its details");
  }

  return reel;
}


export async function updateReelAdmin(
  reelId: number,
  data: {
    title?: string;
    synopsis?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    durationSeconds?: number;
    dramaId?: number | null;
    episodeNumber?: number | null;
    tags?: string[];
    isPublished?: boolean;
    viewCount?: number;
    likeCount?: number;
  }
): Promise<ReelItem | null> {
  const db = await getDb();
  const existing = await getReel(reelId, true);
  if (!existing) return null;

  const updates: string[] = ["updated_at = ?"];
  const params: unknown[] = [Date.now()];

  if (data.title !== undefined) {
    updates.push("title = ?");
    params.push(data.title.trim());
  }
  if (data.synopsis !== undefined) {
    updates.push("synopsis = ?");
    params.push(data.synopsis.trim() || null);
  }
  if (data.videoUrl !== undefined) {
    updates.push("video_url = ?");
    params.push(data.videoUrl.trim());
  }
  if (data.thumbnailUrl !== undefined) {
    updates.push("thumbnail_url = ?");
    params.push(data.thumbnailUrl.trim() || null);
  }
  if (data.durationSeconds !== undefined) {
    updates.push("duration_seconds = ?");
    params.push(data.durationSeconds);
  }
  if (data.dramaId !== undefined) {
    updates.push("drama_id = ?");
    params.push(data.dramaId || null);
  }
  if (data.episodeNumber !== undefined) {
    updates.push("episode_number = ?");
    params.push(data.episodeNumber || null);
  }
  if (data.tags !== undefined) {
    updates.push("tags_json = ?");
    params.push(JSON.stringify(data.tags));
  }
  if (data.isPublished !== undefined) {
    updates.push("is_published = ?");
    params.push(data.isPublished ? 1 : 0);
  }
  if (data.viewCount !== undefined) {
    updates.push("view_count = ?");
    params.push(data.viewCount);
  }
  if (data.likeCount !== undefined) {
    updates.push("like_count = ?");
    params.push(data.likeCount);
  }

  params.push(reelId);
  await db.run(`UPDATE reels SET ${updates.join(", ")} WHERE reel_id = ?`, params as InValue[]);

  return getReel(reelId, true);
}

export async function deleteReelAdmin(reelId: number): Promise<boolean> {
  const db = await getDb();
  await db.run("DELETE FROM reels WHERE reel_id = ?", [reelId]);
  return true;
}


export async function bulkUpdateReelsPublish(
  reelIds: number[],
  isPublished: boolean
): Promise<number> {
  if (reelIds.length === 0) return 0;

  const db = await getDb();
  const placeholders = reelIds.map(() => "?").join(",");
  const pubVal = isPublished ? 1 : 0;

  await db.run(
    `UPDATE reels
     SET is_published = ?, updated_at = ?
     WHERE reel_id IN (${placeholders})`,
    [pubVal, Date.now(), ...reelIds]
  );

  return reelIds.length;
}


// ==========================================
// USER ADMIN QUERIES
// ==========================================

export async function listUsersAdmin(options: {
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; limit: number; offset: number; items: UserProfile[] }> {
  const db = await getDb();
  const today = getTodayIso();
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const query = options.query?.trim();

  let whereClause = "";
  const params: unknown[] = [];

  if (query) {
    whereClause = "WHERE user_id LIKE ?";
    params.push(`%${query}%`);
  }

  const countRow = (await db.get(`SELECT COUNT(*) as count FROM users ${whereClause}`, params as InValue[])) as {
    count: number;
  };
  const total = countRow.count;

  const sql = `
    SELECT * FROM users
    ${whereClause}
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await db.all(sql, params.concat([limit, offset]) as InValue[]) as UserRow[];

  return {
    total,
    limit,
    offset,
    items: await Promise.all(rows.map((u) => formatUserProfile(u, today))),
  };
}

export async function updateUserCoinsAdmin(
  userId: string,
  newCoins: number,
  streakDay?: number,
  description: string = "Admin Adjustment"
): Promise<UserProfile> {
  const db = await getDb();
  const today = getTodayIso();
  const now = Date.now();

  const user = await getOrCreateUser(userId, today);
  const diff = newCoins - user.coins;
  const sDay = streakDay !== undefined ? streakDay : user.streakDay;

  await db.run(
    `
    UPDATE users
    SET coins = ?, streak_day = ?, updated_at = ?
    WHERE user_id = ?
  `,
    [newCoins, sDay, now, userId]
  );

  if (diff !== 0) {
    await db.run(
      `
      INSERT INTO coin_transactions (user_id, type, amount, description, created_at)
      VALUES (?, 'ADMIN_ADJUSTMENT', ?, ?, ?)
    `,
      [userId, diff, description, now]
    );
  }

  return getOrCreateUser(userId, today);
}

export async function deleteUserAdmin(userId: string): Promise<boolean> {
  const db = await getDb();
  await db.run("DELETE FROM coin_transactions WHERE user_id = ?", [userId]);
  await db.run("DELETE FROM redemption_requests WHERE user_id = ?", [userId]);
  await db.run("DELETE FROM users WHERE user_id = ?", [userId]);
  return true;
}

export async function listTransactionsAdmin(options: {
  userId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; limit: number; offset: number; items: CoinTransaction[] }> {
  const db = await getDb();
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const offset = Math.max(0, options.offset ?? 0);

  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (options.userId?.trim()) {
    whereClauses.push("user_id = ?");
    params.push(options.userId.trim());
  }

  if (options.type?.trim()) {
    whereClauses.push("type = ?");
    params.push(options.type.trim());
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const countRow = (await db.get(`SELECT COUNT(*) as count FROM coin_transactions ${whereSql}`, params as InValue[])) as {
    count: number;
  };
  const total = countRow.count;

  const sql = `
    SELECT id, user_id, type, amount, description, created_at
    FROM coin_transactions
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await db.all(sql, params.concat([limit, offset]) as InValue[]) as TransactionRow[];

  return {
    total,
    limit,
    offset,
    items: rows.map((t) => ({
      id: t.id,
      userId: t.user_id,
      type: t.type as CoinTransaction["type"],
      amount: t.amount,
      description: t.description,
      createdAt: t.created_at,
    })),
  };
}

// ==========================================
// COMPATIBILITY ALIASES
// ==========================================
export const checkInUser = performDailyCheckIn;
export const rewardAd = awardRewardedAd;
export const rewardReel = awardReelWatched;
