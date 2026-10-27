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

// Thin facade over the async libSQL client.
type InValue = null | string | number | boolean | Uint8Array;

interface QueryApi {
  all(sql: string, args?: (InValue)[]): Promise<unknown[]>;
  get(sql: string, args?: (InValue)[]): Promise<unknown>;
  run(sql: string, args?: (InValue)[]): Promise<{ changes: number; lastInsertRowid: number | bigint }>;
}

interface DbApi extends QueryApi {
  /**
   * Runs `fn` inside a single write transaction (BEGIN IMMEDIATE).
   * Every read and write made through the `tx` argument is atomic and
   * serialized against other writers; on any thrown error it is rolled back.
   */
  tx<T>(fn: (tx: QueryApi) => Promise<T>): Promise<T>;
  /** Runs several statements in one round trip (atomic). Returns each statement's rows. */
  batch(stmts: { sql: string; args?: InValue[] }[], mode: "read" | "write"): Promise<unknown[][]>;
}

type Executor = (stmt: { sql: string; args: InValue[] }) => Promise<{
  rows: unknown[];
  rowsAffected: number;
  lastInsertRowid?: bigint;
}>;

function makeQueryApi(exec: Executor): QueryApi {
  return {
    async all(sql, args) {
      const { rows } = await exec({ sql, args: args || [] });
      return rows as unknown[];
    },
    async get(sql, args) {
      const { rows } = await exec({ sql, args: args || [] });
      return rows[0];
    },
    async run(sql, args) {
      const result = await exec({ sql, args: args || [] });
      return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid ?? 0 };
    },
  };
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
  google_sub?: string | null;
  google_email?: string | null;
}

interface TransactionRow {
  id: number;
  user_id: string;
  type: string;
  amount: number;
  description: string;
  created_at: number;
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

// The client and schema setup are created once per process. Caching the
// promise (not the result) means concurrent cold-start requests share one init.
let dbPromise: Promise<DbApi> | null = null;

function getDb(): Promise<DbApi> {
  if (!dbPromise) {
    dbPromise = initDb().catch((err) => {
      dbPromise = null; // allow a retry on the next request
      throw err;
    });
  }
  return dbPromise;
}

async function initDb(): Promise<DbApi> {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error(
      "Missing Turso credentials. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your environment."
    );
  }

  const client = createClient({ url, authToken });
  const base = makeQueryApi((stmt) => client.execute(stmt));

  const api: DbApi = {
    ...base,
    async batch(stmts, mode) {
      const results = await client.batch(
        stmts.map((s) => ({ sql: s.sql, args: s.args || [] })),
        mode
      );
      return results.map((r) => r.rows as unknown[]);
    },
    async tx<T>(fn: (tx: QueryApi) => Promise<T>): Promise<T> {
      const transaction = await client.transaction("write");
      try {
        const result = await fn(makeQueryApi((stmt) => transaction.execute(stmt)));
        await transaction.commit();
        return result;
      } catch (err) {
        try {
          await transaction.rollback();
        } catch {
          // ignore rollback failure; original error is more useful
        }
        throw err;
      } finally {
        transaction.close();
      }
    },
  };

  await createSchema(api);
  return api;
}

// Bump this whenever `statements` below changes. On a cold start we read one
// row instead of re-running ~40 DDL statements against Turso.
const SCHEMA_VERSION = 8;

async function createSchema(db: QueryApi): Promise<void> {
  await db.run(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  const current = (await db.get("SELECT value FROM schema_meta WHERE key = 'version'")) as
    | { value: string }
    | undefined;
  if (current && Number(current.value) >= SCHEMA_VERSION) return;

  // Turso/libsql does NOT allow multiple SQL statements in a single execute() call.
  // Each statement must be sent separately.
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      coins INTEGER NOT NULL DEFAULT 50,
      streak_day INTEGER NOT NULL DEFAULT 0,
      last_check_in_date TEXT,
      created_at REAL NOT NULL,
      updated_at REAL NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS coin_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_at REAL NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS reels (
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
    )`,
    `CREATE TABLE IF NOT EXISTS redemption_requests (
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
    )`,
    `CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at REAL NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_coin_transactions_user ON coin_transactions(user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_dramas_published ON dramas (is_published, drama_id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_episodes_published ON episodes (drama_id, is_published, ep ASC)`,
    `CREATE INDEX IF NOT EXISTS idx_reels_published ON reels (is_published, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_reels_drama ON reels (drama_id)`,
    // Reel feed indexes matching the actual queries (they sort by reel_id, not created_at).
    `CREATE INDEX IF NOT EXISTS idx_reels_pub_id ON reels (is_published, reel_id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_reels_drama_pub_id ON reels (drama_id, is_published, reel_id DESC)`,
    // Trending score as an indexed virtual column, so "trending" doesn't scan the table.
    `ALTER TABLE reels ADD COLUMN trending_score INTEGER GENERATED ALWAYS AS (view_count * 2 + like_count * 5) VIRTUAL`,
    `CREATE INDEX IF NOT EXISTS idx_reels_trending ON reels (is_published, trending_score DESC, reel_id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_redemptions_status ON redemption_requests(status, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_redemptions_user ON redemption_requests(user_id, created_at DESC)`,
    // Migration for B2 URL columns and settings
    `ALTER TABLE dramas ADD COLUMN cover_url_b2 TEXT`,
    `ALTER TABLE episodes ADD COLUMN url_b2 TEXT`,
    `ALTER TABLE reels ADD COLUMN video_url_b2 TEXT`,
    `ALTER TABLE redemption_requests ADD COLUMN receipt_url_b2 TEXT`,
    // Multi-account B2 config (one account per folder type: dramas / reels / payouts)
    `INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('b2_dramas_key_id', '', 0)`,
    `INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('b2_dramas_app_key', '', 0)`,
    `INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('b2_dramas_bucket_id', '', 0)`,
    `INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('b2_dramas_public_url', '', 0)`,
    `INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('b2_reels_key_id', '', 0)`,
    `INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('b2_reels_app_key', '', 0)`,
    `INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('b2_reels_bucket_id', '', 0)`,
    `INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('b2_reels_public_url', '', 0)`,
    `INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('b2_payouts_key_id', '', 0)`,
    `INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('b2_payouts_app_key', '', 0)`,
    `INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('b2_payouts_bucket_id', '', 0)`,
    `INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('b2_payouts_public_url', '', 0)`,
    // User auth: set once a server-signed token has been issued for this user.
    `ALTER TABLE users ADD COLUMN auth_claimed_at REAL`,
    // Google account linking (one Google account per app account, and vice versa).
    `ALTER TABLE users ADD COLUMN google_sub TEXT`,
    `ALTER TABLE users ADD COLUMN google_email TEXT`,
    `ALTER TABLE users ADD COLUMN google_linked_at REAL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub)`,
    // Firebase Authentication: one Firebase user per app account (v8).
    `ALTER TABLE users ADD COLUMN firebase_uid TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users (firebase_uid)`,
    // Refresh tokens (stored as SHA-256 hashes). family_id groups one login
    // session's rotations so a replayed token can revoke the whole session.
    `CREATE TABLE IF NOT EXISTS user_refresh_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      family_id TEXT NOT NULL,
      created_at REAL NOT NULL,
      expires_at REAL NOT NULL,
      rotated_at REAL,
      revoked_at REAL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_refresh_user ON user_refresh_tokens (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_refresh_family ON user_refresh_tokens (family_id)`,
    // Backblaze files waiting to be deleted (from deleted/replaced reels, dramas, episodes).
    // Payout receipts are never queued.
    `CREATE TABLE IF NOT EXISTS b2_delete_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_type TEXT NOT NULL,
      file_url TEXT,
      file_name TEXT,
      enqueued_at REAL NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at REAL NOT NULL,
      last_error TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_b2_delete_url ON b2_delete_queue (folder_type, file_url)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_b2_delete_name ON b2_delete_queue (folder_type, file_name)`,
    `CREATE INDEX IF NOT EXISTS idx_b2_delete_due ON b2_delete_queue (next_attempt_at)`,
    // Keyset paging indexes (admin lists and the app's transaction history).
    `CREATE INDEX IF NOT EXISTS idx_users_updated ON users (updated_at DESC, user_id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_tx_created ON coin_transactions (created_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_tx_user_created_id ON coin_transactions (user_id, created_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_tx_type_created ON coin_transactions (type, created_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_redemptions_created ON redemption_requests (created_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_redemptions_status_created ON redemption_requests (status, created_at DESC, id DESC)`,
    // Claim IDs (Idempotency-Key) already used per user, with the answer given,
    // so a retried claim gets the same answer and a reused ID never pays twice.
    `CREATE TABLE IF NOT EXISTS reward_claim_keys (
      user_id TEXT NOT NULL,
      claim_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at REAL NOT NULL,
      PRIMARY KEY (user_id, claim_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_claim_keys_created ON reward_claim_keys (created_at)`,
    // One row per (user, drama, episode) reward; the primary key makes double-claims impossible.
    // Per-user, per-day reward counters (day = server-side date in APP_TIMEZONE).
    `CREATE TABLE IF NOT EXISTS user_daily_reward_counts (
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      kind TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      last_at REAL NOT NULL,
      PRIMARY KEY (user_id, day, kind)
    )`,
    // One reward per (user, reel).
    `CREATE TABLE IF NOT EXISTS user_reel_rewards (
      user_id TEXT NOT NULL,
      reel_id INTEGER NOT NULL,
      created_at REAL NOT NULL,
      PRIMARY KEY (user_id, reel_id)
    )`,
    // Chunked admin uploads: session state lives in the DB (not on local disk),
    // so any server instance can receive any chunk.
    `CREATE TABLE IF NOT EXISTS upload_sessions (
      session_id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      folder_type TEXT NOT NULL,
      target_name TEXT NOT NULL,
      b2_file_name TEXT NOT NULL,
      b2_file_id TEXT,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      total_chunks INTEGER NOT NULL,
      chunk_size INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'uploading',
      created_at REAL NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS upload_session_parts (
      session_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      sha1 TEXT NOT NULL,
      PRIMARY KEY (session_id, chunk_index)
    )`,
    `CREATE TABLE IF NOT EXISTS user_episode_rewards (
      user_id TEXT NOT NULL,
      drama_id INTEGER NOT NULL,
      ep INTEGER NOT NULL,
      created_at REAL NOT NULL,
      PRIMARY KEY (user_id, drama_id, ep)
    )`,
  ];

  for (const sql of statements) {
    try {
      await db.run(sql);
    } catch (err) {
      // Indexes/tables/columns may already exist; ignore duplicate errors but surface others.
      const message = err instanceof Error ? err.message : String(err);
      if (!/already exists|duplicate/i.test(message)) {
        throw err;
      }
    }
  }

  await db.run(
    `INSERT INTO schema_meta (key, value) VALUES ('version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(SCHEMA_VERSION)]
  );
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

// Settings are read on almost every request; cache them briefly per process.
const SETTINGS_TTL_MS = 30_000;
let settingsCache: { value: SystemSettings; expiresAt: number } | null = null;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export async function getSystemSettings(): Promise<SystemSettings> {
  if (settingsCache && settingsCache.expiresAt > Date.now()) {
    return settingsCache.value;
  }
  const value = await loadSystemSettings();
  settingsCache = { value, expiresAt: Date.now() + SETTINGS_TTL_MS };
  return value;
}

async function loadSystemSettings(): Promise<SystemSettings> {
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
    maxAdRewardsPerDay: parsePositiveInt(map.get("max_ad_rewards_per_day"), 10),
    adRewardCooldownSeconds: parsePositiveInt(map.get("ad_reward_cooldown_seconds"), 30),
    maxReelRewardsPerDay: parsePositiveInt(map.get("max_reel_rewards_per_day"), 20),
    s3Endpoint: map.get("s3_endpoint") || "",
    s3Bucket: map.get("s3_bucket") || "",
    s3AccessKey: map.get("s3_access_key") || "",
    s3SecretKey: map.get("s3_secret_key") || "",
    s3PublicUrl: map.get("s3_public_url") || "",

    // Multi-account B2 config (per-folder overrides)
    b2DramasKeyId: map.get("b2_dramas_key_id") || undefined,
    b2DramasAppKey: map.get("b2_dramas_app_key") || undefined,
    b2DramasBucketId: map.get("b2_dramas_bucket_id") || undefined,
    b2DramasPublicUrl: map.get("b2_dramas_public_url") || undefined,
    b2ReelsKeyId: map.get("b2_reels_key_id") || undefined,
    b2ReelsAppKey: map.get("b2_reels_app_key") || undefined,
    b2ReelsBucketId: map.get("b2_reels_bucket_id") || undefined,
    b2ReelsPublicUrl: map.get("b2_reels_public_url") || undefined,
    b2PayoutsKeyId: map.get("b2_payouts_key_id") || undefined,
    b2PayoutsAppKey: map.get("b2_payouts_app_key") || undefined,
    b2PayoutsBucketId: map.get("b2_payouts_bucket_id") || undefined,
    b2PayoutsPublicUrl: map.get("b2_payouts_public_url") || undefined,
  };
}

export async function updateSystemSettings(updates: Partial<SystemSettings>): Promise<SystemSettings> {
  const db = await getDb();
  const now = Date.now();

  const fieldMap: Record<string, string | number | undefined> = {
    coin_to_pkr_rate: updates.coinToPkrRate !== undefined ? String(updates.coinToPkrRate) : undefined,
    min_redeem_coins: updates.minRedeemCoins !== undefined ? String(updates.minRedeemCoins) : undefined,
    max_ad_rewards_per_day:
      updates.maxAdRewardsPerDay !== undefined && Number.isFinite(updates.maxAdRewardsPerDay)
        ? String(Math.max(0, Math.floor(updates.maxAdRewardsPerDay)))
        : undefined,
    ad_reward_cooldown_seconds:
      updates.adRewardCooldownSeconds !== undefined && Number.isFinite(updates.adRewardCooldownSeconds)
        ? String(Math.max(0, Math.floor(updates.adRewardCooldownSeconds)))
        : undefined,
    max_reel_rewards_per_day:
      updates.maxReelRewardsPerDay !== undefined && Number.isFinite(updates.maxReelRewardsPerDay)
        ? String(Math.max(0, Math.floor(updates.maxReelRewardsPerDay)))
        : undefined,
    s3_endpoint: updates.s3Endpoint !== undefined ? updates.s3Endpoint.trim() : undefined,
    s3_bucket: updates.s3Bucket !== undefined ? updates.s3Bucket.trim() : undefined,
    s3_access_key: updates.s3AccessKey !== undefined ? updates.s3AccessKey.trim() : undefined,
    s3_secret_key: updates.s3SecretKey !== undefined ? updates.s3SecretKey.trim() : undefined,
    s3_public_url: updates.s3PublicUrl !== undefined ? updates.s3PublicUrl.trim() : undefined,

    b2_dramas_key_id: updates.b2DramasKeyId !== undefined ? updates.b2DramasKeyId.trim() : undefined,
    b2_dramas_app_key: updates.b2DramasAppKey !== undefined ? updates.b2DramasAppKey.trim() : undefined,
    b2_dramas_bucket_id: updates.b2DramasBucketId !== undefined ? updates.b2DramasBucketId.trim() : undefined,
    b2_dramas_public_url: updates.b2DramasPublicUrl !== undefined ? updates.b2DramasPublicUrl.trim() : undefined,
    b2_reels_key_id: updates.b2ReelsKeyId !== undefined ? updates.b2ReelsKeyId.trim() : undefined,
    b2_reels_app_key: updates.b2ReelsAppKey !== undefined ? updates.b2ReelsAppKey.trim() : undefined,
    b2_reels_bucket_id: updates.b2ReelsBucketId !== undefined ? updates.b2ReelsBucketId.trim() : undefined,
    b2_reels_public_url: updates.b2ReelsPublicUrl !== undefined ? updates.b2ReelsPublicUrl.trim() : undefined,
    b2_payouts_key_id: updates.b2PayoutsKeyId !== undefined ? updates.b2PayoutsKeyId.trim() : undefined,
    b2_payouts_app_key: updates.b2PayoutsAppKey !== undefined ? updates.b2PayoutsAppKey.trim() : undefined,
    b2_payouts_bucket_id: updates.b2PayoutsBucketId !== undefined ? updates.b2PayoutsBucketId.trim() : undefined,
    b2_payouts_public_url: updates.b2PayoutsPublicUrl !== undefined ? updates.b2PayoutsPublicUrl.trim() : undefined,
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

  settingsCache = null;
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

const REEL_COLUMNS = `
    r.reel_id, r.title, r.synopsis, r.video_url, r.thumbnail_url, r.duration_seconds,
    r.drama_id, d.title as drama_title, r.episode_number, r.tags_json, r.view_count,
    r.like_count, r.is_published, r.created_at, r.updated_at`;

/**
 * Public reel feed.
 * - newest:   keyset on reel_id; cursor = last reel_id.
 * - trending: keyset on (trending_score, reel_id); cursor = "<score>_<reelId>".
 * - random:   jumps to a random point in the id range and reads forward along the
 *             index (no ORDER BY RANDOM() full scan); the cursor is ignored.
 */
export async function listReels(options?: {
  cursor?: string | number;
  limit?: number;
  dramaId?: number;
  sort?: "newest" | "trending" | "random";
}): Promise<{ limit: number; nextCursor: string | null; items: ReelItem[] }> {
  const db = await getDb();
  const limit = Math.max(1, Math.min(options?.limit ?? 10, 50));
  const dramaId = options?.dramaId;
  const sort = options?.sort || "newest";
  const cursor = options?.cursor !== undefined ? String(options.cursor) : undefined;

  const where: string[] = ["r.is_published = 1"];
  const params: InValue[] = [];
  if (dramaId) {
    where.push("r.drama_id = ?");
    params.push(dramaId);
  }

  if (sort === "random") {
    const range = (await db.get(
      `SELECT MIN(r.reel_id) AS lo, MAX(r.reel_id) AS hi FROM reels r WHERE ${where.join(" AND ")}`,
      params
    )) as { lo: number | null; hi: number | null } | undefined;
    if (!range || range.lo === null || range.hi === null) {
      return { limit, nextCursor: null, items: [] };
    }
    const pivot = range.lo + Math.floor(Math.random() * (range.hi - range.lo + 1));
    const base = `SELECT ${REEL_COLUMNS} FROM reels r LEFT JOIN dramas d ON r.drama_id = d.drama_id WHERE ${where.join(" AND ")}`;
    const after = (await db.all(`${base} AND r.reel_id >= ? ORDER BY r.reel_id ASC LIMIT ?`, [
      ...params,
      pivot,
      limit,
    ])) as ReelRow[];
    let rows = after;
    if (after.length < limit) {
      const before = (await db.all(`${base} AND r.reel_id < ? ORDER BY r.reel_id ASC LIMIT ?`, [
        ...params,
        pivot,
        limit - after.length,
      ])) as ReelRow[];
      rows = after.concat(before);
    }
    // Shuffle so consecutive ids don't always appear in order.
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    const hasMore = rows.length >= limit;
    return { limit, nextCursor: hasMore ? "random" : null, items: rows.map(mapReelItem) };
  }

  let orderBy: string;
  if (sort === "trending") {
    if (cursor) {
      const [scoreStr, idStr] = cursor.split("_");
      const score = Number(scoreStr);
      const id = Number(idStr);
      if (Number.isFinite(score) && Number.isFinite(id)) {
        where.push("(r.trending_score < ? OR (r.trending_score = ? AND r.reel_id < ?))");
        params.push(score, score, id);
      }
    }
    orderBy = "r.trending_score DESC, r.reel_id DESC";
  } else {
    const id = cursor !== undefined ? Number(cursor) : NaN;
    if (Number.isFinite(id)) {
      where.push("r.reel_id < ?");
      params.push(id);
    }
    orderBy = "r.reel_id DESC";
  }

  const sql = `
    SELECT ${REEL_COLUMNS}, r.trending_score
    FROM reels r
    LEFT JOIN dramas d ON r.drama_id = d.drama_id
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT ?
  `;
  params.push(limit + 1);

  const rows = (await db.all(sql, params)) as (ReelRow & { trending_score: number })[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore
    ? sort === "trending"
      ? `${last.trending_score}_${last.reel_id}`
      : String(last.reel_id)
    : null;

  return { limit, nextCursor, items: items.map(mapReelItem) };
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

/**
 * Adds many buffered view counts in one round trip (one atomic batch).
 * Used by lib/viewCounter.ts so a popular reel isn't written on every view.
 */
export async function addReelViews(counts: Map<number, number>): Promise<void> {
  if (counts.size === 0) return;
  const db = await getDb();
  await db.batch(
    [...counts].map(([reelId, n]) => ({
      sql: "UPDATE reels SET view_count = view_count + ? WHERE reel_id = ?",
      args: [n, reelId],
    })),
    "write"
  );
}

export async function incrementReelLikes(reelId: number): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE reels SET like_count = like_count + 1 WHERE reel_id = ?", [reelId]);
}

/** Undo a like (never below zero). */
export async function decrementReelLikes(reelId: number): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE reels SET like_count = MAX(0, like_count - 1) WHERE reel_id = ?", [reelId]);
}

// ==========================================
// USER & ECONOMY QUERIES
// ==========================================
//
// Every coin balance change happens inside a single write transaction, and
// balances are changed relatively (`coins = coins + ?`) rather than by writing
// back a value read earlier. That way concurrent requests cannot double-spend,
// double-claim, or overwrite each other's updates.

// The reward "day" is decided by the server, in the app's timezone, never by the
// client. Asia/Karachi has no DST, so days roll over at local midnight.
const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Karachi";
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getTodayIso(): string {
  return dayFormatter.format(new Date()); // en-CA formats as YYYY-MM-DD
}

/** The calendar day before `isoDay` (YYYY-MM-DD). */
function previousDayIso(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * A streak only continues if the last check-in was today or yesterday.
 * After a missed day it counts as 0, so the next check-in is day 1 again.
 */
function effectiveStreak(streakDay: number, lastCheckInDate: string | null, todayIso: string): number {
  if (!lastCheckInDate) return 0;
  if (lastCheckInDate === todayIso || lastCheckInDate === previousDayIso(todayIso)) return streakDay;
  return 0;
}

const SIGNUP_BONUS_COINS = 50;
const AD_REWARD_COINS = 25;
const EPISODE_REWARD_COINS = 15;
const REEL_REWARD_COINS = 5;

/** Creates the user (with signup bonus) if missing. Safe to call concurrently. */
async function ensureUser(tx: QueryApi, userId: string, now: number): Promise<boolean> {
  const inserted = await tx.run(
    `
    INSERT INTO users (user_id, coins, streak_day, last_check_in_date, created_at, updated_at)
    VALUES (?, ?, 0, NULL, ?, ?)
    ON CONFLICT(user_id) DO NOTHING
  `,
    [userId, SIGNUP_BONUS_COINS, now, now]
  );

  if (inserted.changes === 1) {
    await tx.run(
      `
      INSERT INTO coin_transactions (user_id, type, amount, description, created_at)
      VALUES (?, 'SIGNUP_BONUS', ?, 'Welcome bonus coins!', ?)
    `,
      [userId, SIGNUP_BONUS_COINS, now]
    );
    return true;
  }
  return false;
}

export type RewardOptions = {
  /**
   * false = return the profile without the 30 most recent transactions, which
   * saves a query on every reward. The app can load history separately via
   * GET /api/user/transactions. Defaults to true for older app builds.
   */
  includeTransactions?: boolean;
};

/**
 * Builds the profile returned after a write. When the write already returned
 * the user row (UPDATE … RETURNING *), no extra read of the user is needed.
 */
async function profileAfterWrite(
  userId: string,
  row: UserRow | undefined,
  options: RewardOptions
): Promise<UserProfile> {
  const includeTransactions = options.includeTransactions !== false;
  if (!row) {
    if (includeTransactions) return getOrCreateUser(userId);
    const db = await getDb();
    row = (await db.get("SELECT * FROM users WHERE user_id = ?", [userId])) as UserRow | undefined;
    if (!row) return getOrCreateUser(userId);
    return buildUserProfile(row, [], getTodayIso());
  }
  if (!includeTransactions) return buildUserProfile(row, [], getTodayIso());
  const db = await getDb();
  const txRows = await db.all(PROFILE_TX_SQL, [userId]);
  return buildUserProfile(row, txRows, getTodayIso());
}

/** Adds `amount` coins and records the ledger row. Must be called inside a transaction. Returns the updated user. */
async function creditCoins(
  tx: QueryApi,
  userId: string,
  amount: number,
  type: CoinTransaction["type"],
  description: string,
  now: number
): Promise<UserRow> {
  const credit = () =>
    tx.get("UPDATE users SET coins = coins + ?, updated_at = ? WHERE user_id = ? RETURNING *", [
      amount,
      now,
      userId,
    ]) as Promise<UserRow | undefined>;

  // Users normally exist already (they synced first), so only create on a miss.
  let row = await credit();
  if (!row) {
    await ensureUser(tx, userId, now);
    row = await credit();
  }
  await tx.run(
    `
    INSERT INTO coin_transactions (user_id, type, amount, description, created_at)
    VALUES (?, ?, ?, ?, ?)
  `,
    [userId, type, amount, description, now]
  );
  return row!;
}

export async function getOrCreateUser(userId: string): Promise<UserProfile> {
  const db = await getDb();
  const todayIso = getTodayIso();

  // User row + recent transactions in a single round trip.
  const load = () =>
    db.batch(
      [
        { sql: "SELECT * FROM users WHERE user_id = ?", args: [userId] },
        { sql: PROFILE_TX_SQL, args: [userId] },
      ],
      "read"
    );

  let [userRows, txRows] = await load();
  if (userRows.length === 0) {
    await db.tx((tx) => ensureUser(tx, userId, Date.now()));
    [userRows, txRows] = await load();
  }

  return buildUserProfile(userRows[0] as UserRow, txRows, todayIso);
}

/** True if the user exists and a server-signed auth token has been issued for them. */
export async function isUserClaimed(userId: string): Promise<boolean> {
  const db = await getDb();
  const row = (await db.get("SELECT auth_claimed_at FROM users WHERE user_id = ?", [userId])) as
    | { auth_claimed_at: number | null }
    | undefined;
  return Boolean(row?.auth_claimed_at);
}

/**
 * Creates the user if needed and marks it as claimed by a token holder.
 * Returns false if the account was already claimed (someone else holds its token).
 */
export async function claimUser(userId: string): Promise<boolean> {
  const db = await getDb();
  const now = Date.now();
  return db.tx(async (tx) => {
    await ensureUser(tx, userId, now);
    const res = await tx.run(
      "UPDATE users SET auth_claimed_at = ? WHERE user_id = ? AND auth_claimed_at IS NULL",
      [now, userId]
    );
    return res.changes === 1;
  });
}

const PROFILE_TX_LIMIT = 30;
const PROFILE_TX_SQL = `
    SELECT id, user_id, type, amount, description, created_at
    FROM coin_transactions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ${PROFILE_TX_LIMIT}
  `;

function mapProfileTransactions(txRows: unknown[]): CoinTransaction[] {
    return txRows.map(
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
          typeof t.created_at !== "number" ||
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

}

/** Builds the profile from rows already loaded (no queries). */
function buildUserProfile(userRow: UserRow, txRows: unknown[], todayIso: string): UserProfile {
  const canCheckInToday = userRow.last_check_in_date !== todayIso;
  const currentStreak = effectiveStreak(userRow.streak_day, userRow.last_check_in_date, todayIso);
  const nextDay = currentStreak >= 7 ? 1 : currentStreak + 1;
  const nextReward = STREAK_REWARDS[nextDay] || 10;

  const streakSchedule: StreakDayInfo[] = [1, 2, 3, 4, 5, 6, 7].map((day) => {
    let status: "claimed" | "available" | "locked" = "locked";
    if (day <= currentStreak) {
      status = "claimed";
    } else if (day === nextDay && canCheckInToday) {
      status = "available";
    }
    return { day, coins: STREAK_REWARDS[day], status };
  });

  return {
    userId: userRow.user_id,
    coins: userRow.coins,
    streakDay: currentStreak,
    lastCheckInDate: userRow.last_check_in_date,
    googleLinked: Boolean(userRow.google_sub),
    googleEmail: userRow.google_email ?? null,
    canCheckInToday,
    nextCheckInReward: nextReward,
    streakSchedule,
    transactions: mapProfileTransactions(txRows),
  };
}

// ------------------------------------------------------------------
// Claim protection
//
// Every claim is refused on the server if it was already granted, whatever
// device it comes from:
//  - check-in:   once per user per day
//  - episode:    once per user per (drama, episode)
//  - reel:       once per user per reel
//  - ad:         once per user per claim ID (one ID per ad view)
//
// Clients send a claim ID (Idempotency-Key header or `claimId`) that they
// generate once per claim attempt and reuse on retries. Replaying the same ID
// returns the original outcome (`replayed: true`) instead of an error, so a
// network retry of a claim that already succeeded doesn't look like a failure.
// ------------------------------------------------------------------

export type ClaimOptions = RewardOptions & {
  /** Unique per claim attempt; reuse it when retrying the same claim. */
  claimId?: string;
};

export type ClaimCode = "ALREADY_CLAIMED" | "DAILY_LIMIT" | "COOLDOWN" | "CLAIM_ID_REUSED";

const CLAIM_ID_PATTERN = /^[A-Za-z0-9_.:-]{8,128}$/;
export function isValidClaimId(id: unknown): id is string {
  return typeof id === "string" && CLAIM_ID_PATTERN.test(id);
}

/** Thrown inside a claim to roll back its writes while still answering with `result`. */
class ClaimRejected<T> extends Error {
  constructor(public result: T) {
    super("claim rejected");
  }
}

type ClaimBodyResult<R> =
  | { granted: true; row: UserRow; result: Omit<R, "user"> }
  | { granted: false; result: Omit<R, "user"> };

/**
 * Runs one claim in a write transaction, with claim-ID replay protection.
 * `fingerprint` identifies what is being claimed, so a claim ID can't be
 * reused for something else.
 */
async function runClaim<R extends { success: boolean; user: UserProfile }>(args: {
  userId: string;
  kind: string;
  fingerprint: string;
  options: ClaimOptions;
  body: (tx: QueryApi, now: number) => Promise<ClaimBodyResult<R>>;
  mismatch: () => Omit<R, "user">;
}): Promise<R> {
  const { userId, kind, fingerprint, options } = args;
  const claimId = options.claimId;
  const db = await getDb();
  const now = Date.now();

  type Outcome =
    | { type: "replay"; result: Omit<R, "user"> }
    | { type: "mismatch" }
    | { type: "done"; body: ClaimBodyResult<R> };

  const outcome: Outcome = await db
    .tx(async (tx): Promise<Outcome> => {
      if (claimId) {
        const prior = (await tx.get(
          "SELECT kind, fingerprint, result_json FROM reward_claim_keys WHERE user_id = ? AND claim_id = ?",
          [userId, claimId]
        )) as { kind: string; fingerprint: string; result_json: string } | undefined;
        if (prior) {
          if (prior.kind !== kind || prior.fingerprint !== fingerprint) return { type: "mismatch" };
          return { type: "replay", result: JSON.parse(prior.result_json) };
        }
      }

      const body = await args.body(tx, now);

      // Remember the outcome for this claim ID, so retries get the same answer.
      if (claimId) {
        await tx.run(
          `INSERT INTO reward_claim_keys (user_id, claim_id, kind, fingerprint, result_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [userId, claimId, kind, fingerprint, JSON.stringify(body.result), now]
        );
      }
      return { type: "done", body };
    })
    .catch((err): Outcome => {
      if (err instanceof ClaimRejected) {
        return { type: "done", body: { granted: false, result: err.result as Omit<R, "user"> } };
      }
      throw err;
    });

  if (outcome.type === "mismatch") {
    const user = await profileAfterWrite(userId, undefined, options);
    return { ...args.mismatch(), user } as R;
  }
  if (outcome.type === "replay") {
    const user = await profileAfterWrite(userId, undefined, options);
    // Report the live balance; everything else is the original answer.
    return { ...outcome.result, newCoinsBalance: user.coins, replayed: true, user } as unknown as R;
  }
  const user = await profileAfterWrite(userId, outcome.body.granted ? outcome.body.row : undefined, options);
  const result = { ...outcome.body.result, user } as R;
  if (!outcome.body.granted && "newCoinsBalance" in result) {
    (result as { newCoinsBalance: number }).newCoinsBalance = user.coins;
  }
  return result;
}

const claimIdReused = (what: string) => ({
  success: false,
  code: "CLAIM_ID_REUSED" as const,
  message: `This claim ID was already used for a different ${what}. Generate a new one per claim.`,
  coinsEarned: 0,
  newCoinsBalance: 0,
});

export async function performDailyCheckIn(userId: string, options: ClaimOptions = {}): Promise<CheckInResult> {
  const today = getTodayIso();
  return runClaim<CheckInResult>({
    userId,
    kind: "checkin",
    fingerprint: today,
    options,
    mismatch: () => ({ ...claimIdReused("claim"), streakDay: 0, isCycleReset: false }),
    body: async (tx, now) => {
      const readUser = () =>
        tx.get("SELECT coins, streak_day, last_check_in_date FROM users WHERE user_id = ?", [userId]) as Promise<
          { coins: number; streak_day: number; last_check_in_date: string | null } | undefined
        >;
      let row = await readUser();
      if (!row) {
        await ensureUser(tx, userId, now);
        row = (await readUser())!;
      }

      const already = {
        granted: false as const,
        result: {
          success: false,
          code: "ALREADY_CLAIMED" as const,
          alreadyClaimed: true,
          message: "You have already claimed today's check-in bonus!",
          coinsEarned: 0,
          newCoinsBalance: row.coins,
          streakDay: effectiveStreak(row.streak_day, row.last_check_in_date, today),
          isCycleReset: false,
        },
      };
      if (row.last_check_in_date === today) return already;

      let newStreak = effectiveStreak(row.streak_day, row.last_check_in_date, today) + 1;
      let isCycleReset = false;
      if (newStreak > 7) {
        newStreak = 1;
        isCycleReset = true;
      }
      const rewardCoins = STREAK_REWARDS[newStreak] || 10;

      // The date guard makes the update itself refuse a second claim, on top of
      // the write transaction serializing concurrent check-ins.
      const updated = (await tx.get(
        `UPDATE users
         SET coins = coins + ?, streak_day = ?, last_check_in_date = ?, updated_at = ?
         WHERE user_id = ? AND (last_check_in_date IS NULL OR last_check_in_date <> ?)
         RETURNING *`,
        [rewardCoins, newStreak, today, now, userId, today]
      )) as UserRow | undefined;
      if (!updated) return already;

      const desc = isCycleReset
        ? `Completed 7-day cycle! Day 1 Bonus: +${rewardCoins} coins`
        : `Day ${newStreak} Daily Check-in: +${rewardCoins} coins`;
      await tx.run(
        `INSERT INTO coin_transactions (user_id, type, amount, description, created_at)
         VALUES (?, 'DAILY_CHECKIN', ?, ?, ?)`,
        [userId, rewardCoins, desc, now]
      );

      return {
        granted: true,
        row: updated,
        result: {
          success: true,
          message: isCycleReset
            ? `Congratulations! 7-day cycle completed. You earned ${rewardCoins} coins and streak has reset!`
            : `Day ${newStreak} check-in claimed! +${rewardCoins} coins added.`,
          coinsEarned: rewardCoins,
          newCoinsBalance: updated.coins,
          streakDay: newStreak,
          isCycleReset,
        },
      };
    },
  });
}

type DailyRewardKind = "AD" | "REEL";

/**
 * Atomically counts one more reward of `kind` for today, if the user is under
 * `maxPerDay` and (optionally) past the cooldown since their last one.
 * Must be called inside a transaction.
 */
async function takeDailyRewardSlot(
  tx: QueryApi,
  userId: string,
  kind: DailyRewardKind,
  day: string,
  now: number,
  maxPerDay: number,
  cooldownSeconds = 0
): Promise<{ ok: true } | { ok: false; reason: "LIMIT" | "COOLDOWN"; retryAfterSeconds?: number }> {
  const row = (await tx.get(
    "SELECT count, last_at FROM user_daily_reward_counts WHERE user_id = ? AND day = ? AND kind = ?",
    [userId, day, kind]
  )) as { count: number; last_at: number } | undefined;

  if (maxPerDay <= 0 || (row && row.count >= maxPerDay)) {
    return { ok: false, reason: "LIMIT" };
  }
  if (row && cooldownSeconds > 0) {
    const elapsed = (now - row.last_at) / 1000;
    if (elapsed < cooldownSeconds) {
      return { ok: false, reason: "COOLDOWN", retryAfterSeconds: Math.ceil(cooldownSeconds - elapsed) };
    }
  }

  await tx.run(
    `INSERT INTO user_daily_reward_counts (user_id, day, kind, count, last_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(user_id, day, kind) DO UPDATE SET count = count + 1, last_at = excluded.last_at`,
    [userId, day, kind, now]
  );
  return { ok: true };
}

/**
 * Ad rewards are refused per claim ID: each ad view gets one ID, and a second
 * claim with that ID (from any device) never pays again. Without a claim ID
 * only the daily cap and cooldown apply (old app builds), unless
 * REQUIRE_AD_CLAIM_ID=true, in which case the route rejects the request.
 */
export async function awardRewardedAd(
  userId: string,
  adType: string = "REWARDED_VIDEO",
  options: ClaimOptions = {}
): Promise<RewardResult> {
  const today = getTodayIso();
  const settings = await getSystemSettings();
  return runClaim<RewardResult>({
    userId,
    kind: "ad",
    fingerprint: adType,
    options,
    mismatch: () => claimIdReused("ad reward"),
    body: async (tx, now) => {
      const slot = await takeDailyRewardSlot(
        tx,
        userId,
        "AD",
        today,
        now,
        settings.maxAdRewardsPerDay,
        settings.adRewardCooldownSeconds
      );
      if (!slot.ok) {
        // Not remembered under the claim ID: nothing was granted.
        throw new ClaimRejected({
          success: false,
          code: slot.reason === "LIMIT" ? ("DAILY_LIMIT" as const) : ("COOLDOWN" as const),
          message:
            slot.reason === "LIMIT"
              ? `Daily ad reward limit reached (${settings.maxAdRewardsPerDay} per day). Come back tomorrow!`
              : `Please wait ${slot.retryAfterSeconds}s before claiming another ad reward.`,
          coinsEarned: 0,
          newCoinsBalance: 0,
          limitReason: slot.reason,
          retryAfterSeconds: slot.retryAfterSeconds,
        });
      }
      const row = await creditCoins(tx, userId, AD_REWARD_COINS, "REWARD_AD", `Watched Sponsored Video Ad (${adType})`, now);
      return {
        granted: true,
        row,
        result: {
          success: true,
          message: `Watched reward ad successfully! +${AD_REWARD_COINS} coins added.`,
          coinsEarned: AD_REWARD_COINS,
          newCoinsBalance: row.coins,
        },
      };
    },
  });
}

export async function awardEpisodeWatched(
  userId: string,
  dramaId: number,
  ep: number,
  options: ClaimOptions = {}
): Promise<RewardResult> {
  const description = `Watched episode ${ep} of drama #${dramaId}`;
  return runClaim<RewardResult>({
    userId,
    kind: "episode",
    fingerprint: `${dramaId}:${ep}`,
    options,
    mismatch: () => claimIdReused("episode"),
    body: async (tx, now) => {
      // Rewards granted before user_episode_rewards existed are only in the ledger.
      const legacy = await tx.get(
        `SELECT id FROM coin_transactions
         WHERE user_id = ? AND type = 'EPISODE_WATCHED' AND description = ? LIMIT 1`,
        [userId, description]
      );
      // The primary key on (user_id, drama_id, ep) refuses a second claim from any device.
      const claim = await tx.run(
        `INSERT INTO user_episode_rewards (user_id, drama_id, ep, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, drama_id, ep) DO NOTHING`,
        [userId, dramaId, ep, now]
      );
      if (legacy || claim.changes !== 1) {
        return {
          granted: false,
          result: {
            success: false,
            code: "ALREADY_CLAIMED" as const,
            alreadyClaimed: true,
            message: "Episode reward already claimed.",
            coinsEarned: 0,
            newCoinsBalance: 0,
          },
        };
      }
      const row = await creditCoins(tx, userId, EPISODE_REWARD_COINS, "EPISODE_WATCHED", description, now);
      return {
        granted: true,
        row,
        result: {
          success: true,
          message: `Finished episode ${ep}! +${EPISODE_REWARD_COINS} coins added.`,
          coinsEarned: EPISODE_REWARD_COINS,
          newCoinsBalance: row.coins,
        },
      };
    },
  });
}

export async function awardReelWatched(
  userId: string,
  reelId: number,
  options: ClaimOptions = {}
): Promise<RewardResult> {
  const today = getTodayIso();
  const settings = await getSystemSettings();
  return runClaim<RewardResult>({
    userId,
    kind: "reel",
    fingerprint: String(reelId),
    options,
    mismatch: () => claimIdReused("reel"),
    body: async (tx, now) => {
      // The primary key on (user_id, reel_id) refuses a second claim from any device.
      const claim = await tx.run(
        `INSERT INTO user_reel_rewards (user_id, reel_id, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id, reel_id) DO NOTHING`,
        [userId, reelId, now]
      );
      if (claim.changes !== 1) {
        return {
          granted: false,
          result: {
            success: false,
            code: "ALREADY_CLAIMED" as const,
            alreadyClaimed: true,
            message: "Reel reward already claimed.",
            coinsEarned: 0,
            newCoinsBalance: 0,
          },
        };
      }

      const slot = await takeDailyRewardSlot(tx, userId, "REEL", today, now, settings.maxReelRewardsPerDay);
      if (!slot.ok) {
        // Roll back the reel claim so this reel can still be rewarded tomorrow.
        throw new ClaimRejected({
          success: false,
          code: "DAILY_LIMIT" as const,
          message: `Daily reel reward limit reached (${settings.maxReelRewardsPerDay} per day). Come back tomorrow!`,
          coinsEarned: 0,
          newCoinsBalance: 0,
          limitReason: "LIMIT" as const,
        });
      }

      const row = await creditCoins(tx, userId, REEL_REWARD_COINS, "REEL_WATCHED", `Watched Short Reel #${reelId}`, now);
      return {
        granted: true,
        row,
        result: {
          success: true,
          message: `Watched short reel! +${REEL_REWARD_COINS} coins added.`,
          coinsEarned: REEL_REWARD_COINS,
          newCoinsBalance: row.coins,
        },
      };
    },
  });
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
}, options: RewardOptions = {}): Promise<{ success: boolean; message: string; redemption?: RedemptionRequest; user?: UserProfile }> {
  invalidateCounts("redemptions");
  const db = await getDb();
  const now = Date.now();
  const settings = await getSystemSettings();

  if (!Number.isInteger(data.coinsAmount) || data.coinsAmount < settings.minRedeemCoins) {
    return {
      success: false,
      message: `Minimum redemption threshold is ${settings.minRedeemCoins} coins (${(settings.minRedeemCoins * settings.coinToPkrRate).toFixed(2)} PKR).`,
      user: await profileAfterWrite(data.userId, undefined, options),
    };
  }

  const exchangeRate = settings.coinToPkrRate;
  const pkrAmount = Math.round(data.coinsAmount * exchangeRate * 100) / 100;

  const outcome = await db.tx(async (tx) => {
    await ensureUser(tx, data.userId, now);

    // Deduct only if the balance covers it, in one statement.
    const debit = await tx.run(
      "UPDATE users SET coins = coins - ?, updated_at = ? WHERE user_id = ? AND coins >= ?",
      [data.coinsAmount, now, data.userId, data.coinsAmount]
    );
    if (debit.changes !== 1) {
      const row = (await tx.get("SELECT coins FROM users WHERE user_id = ?", [data.userId])) as { coins: number };
      return { ok: false as const, balance: row.coins };
    }

    await tx.run(
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

    const row = (await tx.get(
      `
        INSERT INTO redemption_requests (
          user_id, coins_amount, exchange_rate, pkr_amount,
          payment_method, account_title, account_number, bank_name,
          status, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
        RETURNING *
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
    )) as RedemptionRow;

    return { ok: true as const, row };
  });

  const updatedUser = await profileAfterWrite(data.userId, undefined, options);

  if (!outcome.ok) {
    return {
      success: false,
      message: `Insufficient coin balance. You have ${outcome.balance} coins, but requested ${data.coinsAmount}.`,
      user: updatedUser,
    };
  }

  return {
    success: true,
    message: `Redemption request submitted successfully for ${pkrAmount} PKR. An admin will review and process your payout.`,
    redemption: mapRedemptionRequest(outcome.row),
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

// ==========================================
// ADMIN LIST PAGING (keyset + cached totals)
// ==========================================
// Admin lists page with a cursor (the last row's sort key) instead of OFFSET,
// so page 500 is as fast as page 1. Totals come from COUNT(*), cached for 60 s
// per filter so paging doesn't re-count the table on every click.

const COUNT_TTL_MS = 60_000;
const countCache = new Map<string, { n: number; at: number }>();

async function cachedCount(table: string, sql: string, params: InValue[]): Promise<number> {
  const key = `${table}|${sql}|${JSON.stringify(params)}`;
  const hit = countCache.get(key);
  if (hit && Date.now() - hit.at < COUNT_TTL_MS) return hit.n;
  const db = await getDb();
  const row = (await db.get(sql, params)) as { count: number };
  if (countCache.size > 500) countCache.clear();
  countCache.set(key, { n: row.count, at: Date.now() });
  return row.count;
}

/** Drop cached totals for a table after rows are added or removed. */
function invalidateCounts(table: string): void {
  for (const key of countCache.keys()) if (key.startsWith(`${table}|`)) countCache.delete(key);
}

export type AdminPage<T> = {
  total: number;
  limit: number;
  offset: number;
  items: T[];
  /** Pass back as `cursor` to get the next page; null on the last page. */
  nextCursor: string | null;
};

async function keysetPage<Row>(opts: {
  table: string;
  select: string; // "SELECT … FROM … [JOIN …]"
  from: string; // "FROM … [JOIN …]" (for the count)
  where: string[];
  params: InValue[];
  orderCols: string[]; // all sorted DESC; the last one must be unique
  rowKey: (row: Row) => (string | number)[];
  limit: number;
  offset: number;
  cursor?: string | null;
}): Promise<{ total: number; rows: Row[]; nextCursor: string | null }> {
  const db = await getDb();
  const baseWhere = opts.where.length ? `WHERE ${opts.where.join(" AND ")}` : "";
  const total = await cachedCount(opts.table, `SELECT COUNT(*) as count ${opts.from} ${baseWhere}`, opts.params);

  const where = [...opts.where];
  const params = [...opts.params];
  const after = decodeCursor(opts.cursor, opts.orderCols.length);
  if (after) {
    if (opts.orderCols.length === 1) {
      where.push(`${opts.orderCols[0]} < ?`);
      params.push(after[0]);
    } else {
      const [c1, c2] = opts.orderCols;
      where.push(`(${c1} < ? OR (${c1} = ? AND ${c2} < ?))`);
      params.push(after[0], after[0], after[1]);
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const order = opts.orderCols.map((c) => `${c} DESC`).join(", ");
  let sql = `${opts.select} ${whereSql} ORDER BY ${order} LIMIT ?`;
  params.push(opts.limit + 1);
  if (!after && opts.offset > 0) {
    // Old offset paging still works for existing callers.
    sql += " OFFSET ?";
    params.push(opts.offset);
  }

  const rows = (await db.all(sql, params)) as Row[];
  const page = rows.slice(0, opts.limit);
  const last = page[page.length - 1];
  return {
    total,
    rows: page,
    nextCursor: rows.length > opts.limit && last ? encodeCursor(opts.rowKey(last)) : null,
  };
}

export async function listRedemptionsAdmin(options: {
  status?: string;
  userId?: string;
  limit?: number;
  offset?: number;
  cursor?: string | null;
}): Promise<AdminPage<RedemptionRequest>> {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const where: string[] = [];
  const params: InValue[] = [];
  if (options.status && options.status !== "all") {
    where.push("status = ?");
    params.push(options.status.toUpperCase());
  }
  if (options.userId?.trim()) {
    where.push("user_id LIKE ?");
    params.push(`%${options.userId.trim()}%`);
  }
  const { total, rows, nextCursor } = await keysetPage<RedemptionRow>({
    table: "redemptions",
    select: "SELECT * FROM redemption_requests",
    from: "FROM redemption_requests",
    where,
    params,
    orderCols: ["created_at", "id"],
    rowKey: (r) => [r.created_at, r.id],
    limit,
    offset,
    cursor: options.cursor,
  });
  return { total, limit, offset, nextCursor, items: rows.map(mapRedemptionRequest) };
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
  invalidateCounts("redemptions");
  const db = await getDb();
  const now = Date.now();

  if (data.action === "PAID") {
    if (!data.transactionRef?.trim()) {
      return { success: false, message: "Transaction ID / Reference is mandatory when marking as PAID." };
    }
    if (!data.receiptUrl?.trim()) {
      return { success: false, message: "Receipt screenshot URL is mandatory when marking as PAID." };
    }
  }

  const outcome = await db.tx(async (tx) => {
    const existing = (await tx.get("SELECT * FROM redemption_requests WHERE id = ?", [id])) as
      | RedemptionRow
      | undefined;
    if (!existing) {
      return { ok: false as const, message: "Redemption request not found" };
    }

    // `AND status = 'PENDING'` makes the transition happen at most once,
    // so a request can never be both paid and refunded, or refunded twice.
    if (data.action === "PAID") {
      const res = await tx.run(
        `
        UPDATE redemption_requests
        SET status = 'PAID', transaction_ref = ?, receipt_url = ?, admin_notes = ?, processed_at = ?
        WHERE id = ? AND status = 'PENDING'
      `,
        [data.transactionRef!.trim(), data.receiptUrl!.trim(), data.adminNotes?.trim() || null, now, id]
      );
      if (res.changes !== 1) {
        return { ok: false as const, message: `Request is already ${existing.status}` };
      }
    } else {
      const res = await tx.run(
        `
        UPDATE redemption_requests
        SET status = 'REJECTED', admin_notes = ?, processed_at = ?
        WHERE id = ? AND status = 'PENDING'
      `,
        [data.adminNotes?.trim() || null, now, id]
      );
      if (res.changes !== 1) {
        return { ok: false as const, message: `Request is already ${existing.status}` };
      }

      // Refund coins back to user
      await ensureUser(tx, existing.user_id, now);
      await creditCoins(
        tx,
        existing.user_id,
        existing.coins_amount,
        "ADMIN_ADJUSTMENT",
        `Refund for Rejected Redemption #${id}: ${data.adminNotes || "Rejected by administrator"}`,
        now
      );
    }

    const updated = (await tx.get("SELECT * FROM redemption_requests WHERE id = ?", [id])) as RedemptionRow;
    return { ok: true as const, updated };
  });

  if (!outcome.ok) {
    return { success: false, message: outcome.message };
  }

  return {
    success: true,
    message: `Redemption #${id} marked as ${data.action} successfully`,
    redemption: mapRedemptionRequest(outcome.updated),
  };
}

// ==========================================
// ADMIN DASHBOARD & CRUD QUERIES
// ==========================================

// The dashboard aggregates whole tables; cache it briefly so repeated page loads
// and multiple admins don't re-scan users/transactions every time.
const STATS_TTL_MS = 60_000;
let statsCache: { value: AdminDashboardStats; expiresAt: number } | null = null;

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  if (statsCache && statsCache.expiresAt > Date.now()) return statsCache.value;
  const value = await computeAdminDashboardStats();
  statsCache = { value, expiresAt: Date.now() + STATS_TTL_MS };
  return value;
}

async function computeAdminDashboardStats(): Promise<AdminDashboardStats> {
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
      SUM(CASE WHEN streak_day > 0 AND last_check_in_date >= ? THEN 1 ELSE 0 END) as activeStreaks
    FROM users
  `, [previousDayIso(today)])) as { total: number; totalCoins: number; activeStreaks: number };

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
    recentUsers: recentUserRows.map((u) => buildUserProfile(u, [], today)),
  };
}

export async function listDramasAdmin(options: {
  query?: string;
  status?: "all" | "published" | "draft";
  limit?: number;
  offset?: number;
  cursor?: string | null;
}): Promise<AdminPage<DramaCard>> {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const query = options.query?.trim();
  const status = options.status || "all";
  const where: string[] = [];
  const params: InValue[] = [];
  if (query) {
    where.push("(title LIKE ? OR synopsis LIKE ? OR slug LIKE ?)");
    params.push(`%${query}%`, `%${query}%`, `%${query}%`);
  }
  if (status === "published") where.push("is_published = 1");
  else if (status === "draft") where.push("is_published = 0");

  const { total, rows, nextCursor } = await keysetPage<DramaListRow>({
    table: "dramas",
    select:
      "SELECT drama_id, slug, title, cover, play_count, episode_count, latest_episode_label, is_published FROM dramas",
    from: "FROM dramas",
    where,
    params,
    orderCols: ["drama_id"],
    rowKey: (r) => [r.drama_id],
    limit,
    offset,
    cursor: options.cursor,
  });
  return { total, limit, offset, nextCursor, items: rows.map(mapDramaCard) };
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
  invalidateCounts("dramas");
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
  invalidateCounts("dramas");
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

  if (data.cover !== undefined && (data.cover.trim() || null) !== (existing.cover ?? null)) {
    await enqueueFileDeletes(db, "dramas", [existing.cover]);
  }

  return getDrama(dramaId, true);
}

export async function deleteDramaAdmin(dramaId: number): Promise<boolean> {
  invalidateCounts("dramas");
  invalidateCounts("reels");
  const db = await getDb();
  await db.tx(async (tx) => {
    const drama = (await tx.get("SELECT cover FROM dramas WHERE drama_id = ?", [dramaId])) as
      | { cover: string | null }
      | undefined;
    const episodes = (await tx.all("SELECT url FROM episodes WHERE drama_id = ?", [dramaId])) as {
      url: string | null;
    }[];
    const reels = (await tx.all("SELECT video_url, thumbnail_url FROM reels WHERE drama_id = ?", [dramaId])) as {
      video_url: string | null;
      thumbnail_url: string | null;
    }[];

    await tx.run("DELETE FROM episodes WHERE drama_id = ?", [dramaId]);
    await tx.run("DELETE FROM reels WHERE drama_id = ?", [dramaId]);
    await tx.run("DELETE FROM dramas WHERE drama_id = ?", [dramaId]);

    await enqueueFileDeletes(tx, "dramas", [drama?.cover, ...episodes.map((e) => e.url)]);
    await enqueueFileDeletes(tx, "reels", reels.flatMap((r) => [r.video_url, r.thumbnail_url]));
  });
  return true;
}

export async function bulkUpdateDramasPublish(
  dramaIds: number[],
  isPublished: boolean
): Promise<number> {
  if (!dramaIds || dramaIds.length === 0) return 0;
  invalidateCounts("dramas");
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
  invalidateCounts("dramas");
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

  await db.tx(async (tx) => {
    const old = (await tx.get("SELECT url FROM episodes WHERE drama_id = ? AND ep = ?", [dramaId, ep])) as
      | { url: string | null }
      | undefined;
    await tx.run(
      `
      INSERT INTO episodes (drama_id, ep, url, is_published, source, raw_json, fetched_at)
      VALUES (?, ?, ?, ?, 1, '{}', ?)
      ON CONFLICT(drama_id, ep) DO UPDATE SET url = excluded.url, is_published = excluded.is_published, fetched_at = excluded.fetched_at
    `,
      [dramaId, ep, url.trim(), pubVal, now]
    );
    await tx.run(
      `UPDATE dramas
       SET episode_count = (SELECT COUNT(*) FROM episodes WHERE drama_id = ?), latest_episode_label = 'EP ' || ?, updated_at = datetime('now')
       WHERE drama_id = ?`,
      [dramaId, ep, dramaId]
    );
    if (old?.url && old.url !== url.trim()) await enqueueFileDeletes(tx, "dramas", [old.url]);
  });

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
  await db.tx(async (tx) => {
    const row = (await tx.get("SELECT url FROM episodes WHERE drama_id = ? AND ep = ?", [dramaId, ep])) as
      | { url: string | null }
      | undefined;
    await tx.run("DELETE FROM episodes WHERE drama_id = ? AND ep = ?", [dramaId, ep]);
    await tx.run(
      `UPDATE dramas
       SET episode_count = (SELECT COUNT(*) FROM episodes WHERE drama_id = ?), updated_at = datetime('now')
       WHERE drama_id = ?`,
      [dramaId, dramaId]
    );
    if (row) await enqueueFileDeletes(tx, "dramas", [row.url]);
  });

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
  cursor?: string | null;
}): Promise<AdminPage<ReelItem>> {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const query = options.query?.trim();
  const status = options.status || "all";
  const where: string[] = [];
  const params: InValue[] = [];
  if (query) {
    where.push("(r.title LIKE ? OR r.synopsis LIKE ? OR d.title LIKE ?)");
    params.push(`%${query}%`, `%${query}%`, `%${query}%`);
  }
  if (status === "published") where.push("r.is_published = 1");
  else if (status === "draft") where.push("r.is_published = 0");
  if (options.dramaId) {
    where.push("r.drama_id = ?");
    params.push(options.dramaId);
  }

  const { total, rows, nextCursor } = await keysetPage<ReelRow>({
    table: "reels",
    select: `SELECT ${REEL_COLUMNS} FROM reels r LEFT JOIN dramas d ON r.drama_id = d.drama_id`,
    from: "FROM reels r LEFT JOIN dramas d ON r.drama_id = d.drama_id",
    where,
    params,
    orderCols: ["r.reel_id"],
    rowKey: (r) => [r.reel_id],
    limit,
    offset,
    cursor: options.cursor,
  });
  return { total, limit, offset, nextCursor, items: rows.map(mapReelItem) };
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
  invalidateCounts("reels");
  const db = await getDb();
  const now = Date.now();
  const tagsJson = JSON.stringify(data.tags ?? []);
  const pubVal = data.isPublished ? 1 : 0;

  const inserted = await db.run(
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

  const reel = await getReel(Number(inserted.lastInsertRowid), true);

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
  invalidateCounts("reels");
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

  // A replaced video or thumbnail leaves the old file unused: queue it for deletion.
  const replaced: (string | null | undefined)[] = [];
  if (data.videoUrl !== undefined && data.videoUrl.trim() !== existing.videoUrl) replaced.push(existing.videoUrl);
  if (data.thumbnailUrl !== undefined && (data.thumbnailUrl.trim() || null) !== (existing.thumbnailUrl ?? null)) {
    replaced.push(existing.thumbnailUrl);
  }
  if (replaced.length) await enqueueFileDeletes(db, "reels", replaced);

  return getReel(reelId, true);
}

export async function deleteReelAdmin(reelId: number): Promise<boolean> {
  invalidateCounts("reels");
  const db = await getDb();
  await db.tx(async (tx) => {
    const row = (await tx.get("SELECT video_url, thumbnail_url FROM reels WHERE reel_id = ?", [reelId])) as
      | { video_url: string | null; thumbnail_url: string | null }
      | undefined;
    await tx.run("DELETE FROM reels WHERE reel_id = ?", [reelId]);
    if (row) await enqueueFileDeletes(tx, "reels", [row.video_url, row.thumbnail_url]);
  });
  return true;
}


export async function bulkUpdateReelsPublish(
  reelIds: number[],
  isPublished: boolean
): Promise<number> {
  if (reelIds.length === 0) return 0;

  invalidateCounts("reels");
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
  cursor?: string | null;
}): Promise<AdminPage<UserProfile>> {
  const today = getTodayIso();
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const query = options.query?.trim();
  const where: string[] = [];
  const params: InValue[] = [];
  if (query) {
    where.push("(user_id LIKE ? OR google_email LIKE ?)");
    params.push(`%${query}%`, `%${query}%`);
  }

  const { total, rows, nextCursor } = await keysetPage<UserRow>({
    table: "users",
    select: "SELECT * FROM users",
    from: "FROM users",
    where,
    params,
    orderCols: ["updated_at", "user_id"],
    rowKey: (u) => [u.updated_at, u.user_id],
    limit,
    offset,
    cursor: options.cursor,
  });
  // Transactions are loaded per user on demand (/api/admin/transactions), not for the whole list.
  return { total, limit, offset, nextCursor, items: rows.map((u) => buildUserProfile(u, [], today)) };
}

export async function updateUserCoinsAdmin(
  userId: string,
  newCoins: number,
  streakDay?: number,
  description: string = "Admin Adjustment"
): Promise<UserProfile> {
  const db = await getDb();
  const now = Date.now();

  await db.tx(async (tx) => {
    await ensureUser(tx, userId, now);
    const row = (await tx.get("SELECT coins, streak_day FROM users WHERE user_id = ?", [userId])) as {
      coins: number;
      streak_day: number;
    };
    const diff = newCoins - row.coins;
    const sDay = streakDay !== undefined ? streakDay : row.streak_day;

    await tx.run("UPDATE users SET coins = ?, streak_day = ?, updated_at = ? WHERE user_id = ?", [
      newCoins,
      sDay,
      now,
      userId,
    ]);

    if (diff !== 0) {
      await tx.run(
        `
        INSERT INTO coin_transactions (user_id, type, amount, description, created_at)
        VALUES (?, 'ADMIN_ADJUSTMENT', ?, ?, ?)
      `,
        [userId, diff, description, now]
      );
    }
  });

  return getOrCreateUser(userId);
}

export async function deleteUserAdmin(userId: string): Promise<boolean> {
  invalidateCounts("users");
  const db = await getDb();
  await db.tx(async (tx) => {
    await tx.run("DELETE FROM coin_transactions WHERE user_id = ?", [userId]);
    await tx.run("DELETE FROM redemption_requests WHERE user_id = ?", [userId]);
    await tx.run("DELETE FROM user_episode_rewards WHERE user_id = ?", [userId]);
    await tx.run("DELETE FROM user_refresh_tokens WHERE user_id = ?", [userId]);
    await tx.run("DELETE FROM reward_claim_keys WHERE user_id = ?", [userId]);
    await tx.run("DELETE FROM user_reel_rewards WHERE user_id = ?", [userId]);
    await tx.run("DELETE FROM user_daily_reward_counts WHERE user_id = ?", [userId]);
    await tx.run("DELETE FROM users WHERE user_id = ?", [userId]);
  });
  return true;
}

export async function listTransactionsAdmin(options: {
  userId?: string;
  type?: string;
  limit?: number;
  offset?: number;
  cursor?: string | null;
}): Promise<AdminPage<CoinTransaction>> {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const where: string[] = [];
  const params: InValue[] = [];
  if (options.userId?.trim()) {
    where.push("user_id = ?");
    params.push(options.userId.trim());
  }
  if (options.type?.trim()) {
    where.push("type = ?");
    params.push(options.type.trim());
  }

  const { total, rows, nextCursor } = await keysetPage<TransactionRow>({
    table: "transactions",
    select: "SELECT id, user_id, type, amount, description, created_at FROM coin_transactions",
    from: "FROM coin_transactions",
    where,
    params,
    orderCols: ["created_at", "id"],
    rowKey: (t) => [t.created_at, t.id],
    limit,
    offset,
    cursor: options.cursor,
  });
  return {
    total,
    limit,
    offset,
    nextCursor,
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

// ==========================================
// CHUNKED UPLOAD SESSIONS
// ==========================================

export type UploadSession = {
  sessionId: string;
  fileName: string;
  folderType: string;
  targetName: string;
  b2FileName: string;
  b2FileId: string | null;
  mimeType: string;
  fileSize: number;
  totalChunks: number;
  chunkSize: number;
  status: "uploading" | "completing" | "done";
  createdAt: number;
};

interface UploadSessionRow {
  session_id: string;
  file_name: string;
  folder_type: string;
  target_name: string;
  b2_file_name: string;
  b2_file_id: string | null;
  mime_type: string;
  file_size: number;
  total_chunks: number;
  chunk_size: number;
  status: string;
  created_at: number;
}

function mapUploadSession(r: UploadSessionRow): UploadSession {
  return {
    sessionId: r.session_id,
    fileName: r.file_name,
    folderType: r.folder_type,
    targetName: r.target_name,
    b2FileName: r.b2_file_name,
    b2FileId: r.b2_file_id,
    mimeType: r.mime_type,
    fileSize: r.file_size,
    totalChunks: r.total_chunks,
    chunkSize: r.chunk_size,
    status: r.status as UploadSession["status"],
    createdAt: r.created_at,
  };
}

export async function createUploadSession(session: Omit<UploadSession, "status" | "createdAt">): Promise<void> {
  const db = await getDb();
  await db.run(
    `
    INSERT INTO upload_sessions (
      session_id, file_name, folder_type, target_name, b2_file_name, b2_file_id,
      mime_type, file_size, total_chunks, chunk_size, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?)
  `,
    [
      session.sessionId,
      session.fileName,
      session.folderType,
      session.targetName,
      session.b2FileName,
      session.b2FileId,
      session.mimeType,
      session.fileSize,
      session.totalChunks,
      session.chunkSize,
      Date.now(),
    ]
  );
}

export async function getUploadSession(sessionId: string): Promise<UploadSession | null> {
  const db = await getDb();
  const row = (await db.get("SELECT * FROM upload_sessions WHERE session_id = ?", [sessionId])) as
    | UploadSessionRow
    | undefined;
  return row ? mapUploadSession(row) : null;
}

/** Records a finished part (re-uploads of the same chunk overwrite) and returns all uploaded chunk indexes. */
export async function recordUploadPart(sessionId: string, chunkIndex: number, sha1: string): Promise<number[]> {
  const db = await getDb();
  await db.run(
    `
    INSERT INTO upload_session_parts (session_id, chunk_index, sha1) VALUES (?, ?, ?)
    ON CONFLICT(session_id, chunk_index) DO UPDATE SET sha1 = excluded.sha1
  `,
    [sessionId, chunkIndex, sha1]
  );
  return listUploadedChunks(sessionId);
}

export async function listUploadedChunks(sessionId: string): Promise<number[]> {
  const db = await getDb();
  const rows = (await db.all(
    "SELECT chunk_index FROM upload_session_parts WHERE session_id = ? ORDER BY chunk_index",
    [sessionId]
  )) as { chunk_index: number }[];
  return rows.map((r) => r.chunk_index);
}

export async function getUploadPartSha1s(sessionId: string): Promise<{ chunkIndex: number; sha1: string }[]> {
  const db = await getDb();
  const rows = (await db.all(
    "SELECT chunk_index, sha1 FROM upload_session_parts WHERE session_id = ? ORDER BY chunk_index",
    [sessionId]
  )) as { chunk_index: number; sha1: string }[];
  return rows.map((r) => ({ chunkIndex: r.chunk_index, sha1: r.sha1 }));
}

/** Moves a session from `from` to `to`; returns false if it wasn't in `from` (e.g. already completing). */
export async function transitionUploadSession(
  sessionId: string,
  from: UploadSession["status"],
  to: UploadSession["status"]
): Promise<boolean> {
  const db = await getDb();
  const res = await db.run("UPDATE upload_sessions SET status = ? WHERE session_id = ? AND status = ?", [
    to,
    sessionId,
    from,
  ]);
  return res.changes === 1;
}

export async function deleteUploadSession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.tx(async (tx) => {
    await tx.run("DELETE FROM upload_session_parts WHERE session_id = ?", [sessionId]);
    await tx.run("DELETE FROM upload_sessions WHERE session_id = ?", [sessionId]);
  });
}

// ==========================================
// GOOGLE ACCOUNT LINKING & REFRESH TOKENS
// ==========================================

export async function isGoogleLinked(userId: string): Promise<boolean> {
  const db = await getDb();
  const row = (await db.get("SELECT google_sub FROM users WHERE user_id = ?", [userId])) as
    | { google_sub: string | null }
    | undefined;
  return Boolean(row?.google_sub);
}

export type LinkGoogleResult =
  | { status: "linked" }
  | { status: "already_linked" } // this account was already linked to this Google account
  | { status: "google_in_use" } // the Google account belongs to another app account
  | { status: "account_has_other_google" }; // this app account is linked to a different Google account

/** Links a Google account to an existing app account. Atomic; safe under concurrent calls. */
export async function linkGoogleAccount(userId: string, googleSub: string, email: string | null): Promise<LinkGoogleResult> {
  const db = await getDb();
  const now = Date.now();
  return db.tx(async (tx) => {
    await ensureUser(tx, userId, now);
    const owner = (await tx.get("SELECT user_id FROM users WHERE google_sub = ?", [googleSub])) as
      | { user_id: string }
      | undefined;
    if (owner && owner.user_id !== userId) return { status: "google_in_use" as const };
    if (owner) {
      await tx.run("UPDATE users SET google_email = ? WHERE user_id = ?", [email, userId]);
      return { status: "already_linked" as const };
    }

    const me = (await tx.get("SELECT google_sub FROM users WHERE user_id = ?", [userId])) as {
      google_sub: string | null;
    };
    if (me.google_sub) return { status: "account_has_other_google" as const };

    await tx.run(
      `UPDATE users
       SET google_sub = ?, google_email = ?, google_linked_at = ?, auth_claimed_at = COALESCE(auth_claimed_at, ?), updated_at = ?
       WHERE user_id = ?`,
      [googleSub, email, now, now, now, userId]
    );
    return { status: "linked" as const };
  });
}

/**
 * Finds the app account linked to a Google account, or creates a new one linked
 * to it. Returns the userId and whether it was just created.
 */
export async function findOrCreateUserForGoogle(
  googleSub: string,
  email: string | null,
  newUserId: string
): Promise<{ userId: string; created: boolean }> {
  const db = await getDb();
  const now = Date.now();
  return db.tx(async (tx) => {
    const owner = (await tx.get("SELECT user_id FROM users WHERE google_sub = ?", [googleSub])) as
      | { user_id: string }
      | undefined;
    if (owner) {
      await tx.run("UPDATE users SET google_email = ? WHERE user_id = ?", [email, owner.user_id]);
      return { userId: owner.user_id, created: false };
    }
    await ensureUser(tx, newUserId, now);
    await tx.run(
      `UPDATE users
       SET google_sub = ?, google_email = ?, google_linked_at = ?, auth_claimed_at = ?, updated_at = ?
       WHERE user_id = ?`,
      [googleSub, email, now, now, now, newUserId]
    );
    return { userId: newUserId, created: true };
  });
}

export type ResolveFirebaseUserResult =
  | { status: "ok"; userId: string; created: boolean }
  /** legacyUserId already has a session or a Firebase user: recover it with Google instead. */
  | { status: "legacy_claimed" }
  /** The Firebase user linked a Google account that already belongs to another app account. */
  | { status: "google_in_use" };

/**
 * Maps a *verified* Firebase identity to an app account. Atomic.
 *
 * Coins stay safe because accounts are keyed by the Firebase UID, which
 * Firebase keeps the same when a guest links Google. Nothing is ever merged:
 * 1. an account already bound to this UID → that account (Google fields updated);
 * 2. else, the account already linked to this Google account (created by the
 *    earlier /login-google flow) → bind the UID to it;
 * 3. else, `legacyUserId` from a pre-auth app install that has never been
 *    claimed → bind the UID to it, once;
 * 4. else → create a new account whose user_id is the UID.
 */
export async function resolveFirebaseUser(input: {
  uid: string;
  googleSub: string | null;
  googleEmail: string | null;
  legacyUserId?: string | null;
}): Promise<ResolveFirebaseUserResult> {
  const db = await getDb();
  const now = Date.now();
  const { uid, googleSub, googleEmail } = input;

  return db.tx(async (tx) => {
    // Sets the Google link on `userId` unless that Google account belongs to someone else.
    const applyGoogle = async (userId: string): Promise<boolean> => {
      if (!googleSub) return true;
      const owner = (await tx.get("SELECT user_id FROM users WHERE google_sub = ?", [googleSub])) as
        | { user_id: string }
        | undefined;
      if (owner && owner.user_id !== userId) return false;
      await tx.run(
        `UPDATE users
         SET google_sub = ?, google_email = COALESCE(?, google_email),
             google_linked_at = COALESCE(google_linked_at, ?), updated_at = ?
         WHERE user_id = ?`,
        [googleSub, googleEmail, now, now, userId]
      );
      return true;
    };

    // 1. Already bound to this Firebase user.
    const bound = (await tx.get("SELECT user_id FROM users WHERE firebase_uid = ?", [uid])) as
      | { user_id: string }
      | undefined;
    if (bound) {
      if (!(await applyGoogle(bound.user_id))) return { status: "google_in_use" as const };
      return { status: "ok" as const, userId: bound.user_id, created: false };
    }

    // 2. Account previously linked to this Google account (pre-Firebase sign-in).
    if (googleSub) {
      const byGoogle = (await tx.get(
        "SELECT user_id, firebase_uid FROM users WHERE google_sub = ?",
        [googleSub]
      )) as { user_id: string; firebase_uid: string | null } | undefined;
      if (byGoogle && !byGoogle.firebase_uid) {
        await tx.run(
          `UPDATE users SET firebase_uid = ?, google_email = COALESCE(?, google_email),
             auth_claimed_at = COALESCE(auth_claimed_at, ?), updated_at = ?
           WHERE user_id = ?`,
          [uid, googleEmail, now, now, byGoogle.user_id]
        );
        return { status: "ok" as const, userId: byGoogle.user_id, created: false };
      }
      if (byGoogle) return { status: "google_in_use" as const };
    }

    // 3. Pre-auth install keeping its account (works once, like /sync's userId).
    const legacyUserId = input.legacyUserId?.trim();
    if (legacyUserId && legacyUserId !== uid) {
      const legacy = (await tx.get(
        "SELECT user_id, firebase_uid, auth_claimed_at FROM users WHERE user_id = ?",
        [legacyUserId]
      )) as { user_id: string; firebase_uid: string | null; auth_claimed_at: number | null } | undefined;
      if (legacy) {
        if (legacy.firebase_uid || legacy.auth_claimed_at) return { status: "legacy_claimed" as const };
        await tx.run(
          "UPDATE users SET firebase_uid = ?, auth_claimed_at = ?, updated_at = ? WHERE user_id = ?",
          [uid, now, now, legacy.user_id]
        );
        if (!(await applyGoogle(legacy.user_id))) return { status: "google_in_use" as const };
        return { status: "ok" as const, userId: legacy.user_id, created: false };
      }
      // Unknown legacy id (never reached the server): just create a fresh account below.
    }

    // 4. New account, user_id = Firebase UID.
    const created = await ensureUser(tx, uid, now);
    const claimed = await tx.run(
      `UPDATE users SET firebase_uid = ?, auth_claimed_at = COALESCE(auth_claimed_at, ?), updated_at = ?
       WHERE user_id = ? AND (firebase_uid IS NULL OR firebase_uid = ?)`,
      [uid, now, now, uid, uid]
    );
    if (claimed.changes !== 1) return { status: "legacy_claimed" as const };
    if (!(await applyGoogle(uid))) return { status: "google_in_use" as const };
    return { status: "ok" as const, userId: uid, created };
  });
}

export async function createRefreshToken(input: {
  userId: string;
  tokenHash: string;
  familyId: string;
  ttlMs: number;
}): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.run(
    `INSERT INTO user_refresh_tokens (token_hash, user_id, family_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [input.tokenHash, input.userId, input.familyId, now, now + input.ttlMs]
  );
}

export type RotateResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" | "revoked" | "reused" };

/** A token reused within this window is treated as a client retry, not theft. */
const REFRESH_REUSE_GRACE_MS = 30_000;

/**
 * Exchanges a refresh token for a new one in the same session family.
 * Using an already-rotated token (outside the short grace window) means it was
 * copied: the whole session family is revoked, logging out both copies.
 */
export async function rotateRefreshToken(
  oldHash: string,
  newHash: string,
  ttlMs: number
): Promise<RotateResult> {
  const db = await getDb();
  const now = Date.now();
  return db.tx(async (tx) => {
    const row = (await tx.get("SELECT * FROM user_refresh_tokens WHERE token_hash = ?", [oldHash])) as
      | {
          user_id: string;
          family_id: string;
          expires_at: number;
          rotated_at: number | null;
          revoked_at: number | null;
        }
      | undefined;

    if (!row) return { ok: false as const, reason: "invalid" as const };
    if (row.revoked_at) return { ok: false as const, reason: "revoked" as const };
    if (row.expires_at < now) return { ok: false as const, reason: "expired" as const };
    if (row.rotated_at) {
      if (now - row.rotated_at > REFRESH_REUSE_GRACE_MS) {
        await tx.run("UPDATE user_refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL", [
          now,
          row.family_id,
        ]);
      }
      return { ok: false as const, reason: "reused" as const };
    }

    const user = await tx.get("SELECT user_id FROM users WHERE user_id = ?", [row.user_id]);
    if (!user) return { ok: false as const, reason: "revoked" as const }; // user was deleted

    await tx.run("UPDATE user_refresh_tokens SET rotated_at = ? WHERE token_hash = ?", [now, oldHash]);
    await tx.run(
      `INSERT INTO user_refresh_tokens (token_hash, user_id, family_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [newHash, row.user_id, row.family_id, now, now + ttlMs]
    );
    return { ok: true as const, userId: row.user_id };
  });
}

/** Logs out one session (the family the token belongs to). */
export async function revokeRefreshTokenFamily(tokenHash: string): Promise<void> {
  const db = await getDb();
  const row = (await db.get("SELECT family_id FROM user_refresh_tokens WHERE token_hash = ?", [tokenHash])) as
    | { family_id: string }
    | undefined;
  if (!row) return;
  await db.run("UPDATE user_refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL", [
    Date.now(),
    row.family_id,
  ]);
}

/** Logs a user out on every device (e.g. when banning). */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE user_refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", [
    Date.now(),
    userId,
  ]);
}

// ==========================================
// B2 FILE DELETION QUEUE
// ==========================================
// Rows are deleted immediately; their Backblaze files are queued here and removed
// in the background (lib/b2Cleanup.ts) with retries. Before deleting, the worker
// re-checks that no remaining reel/episode/drama still uses the file.
// Payout receipts are never queued.

export type MediaFolder = "reels" | "dramas";

async function enqueueFileDeletes(q: QueryApi, folder: MediaFolder, urls: (string | null | undefined)[]): Promise<void> {
  const now = Date.now();
  const unique = [...new Set(urls.map((u) => (u || "").trim()).filter((u) => /^https?:\/\//i.test(u)))];
  for (const url of unique) {
    await q.run(
      `INSERT INTO b2_delete_queue (folder_type, file_url, enqueued_at, next_attempt_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [folder, url.split("?")[0], now, now]
    );
  }
}

/** Queues files found by the orphan scan (by B2 file name). */
export async function enqueueB2FileNames(folder: MediaFolder, fileNames: string[]): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  let added = 0;
  for (const name of fileNames) {
    const res = await db.run(
      `INSERT INTO b2_delete_queue (folder_type, file_name, enqueued_at, next_attempt_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [folder, name, now, now]
    );
    added += res.changes;
  }
  return added;
}

export type B2DeleteJob = {
  id: number;
  folderType: MediaFolder;
  fileUrl: string | null;
  fileName: string | null;
  attempts: number;
};

export async function getDueB2Deletes(limit: number): Promise<B2DeleteJob[]> {
  const db = await getDb();
  const rows = (await db.all(
    `SELECT id, folder_type, file_url, file_name, attempts FROM b2_delete_queue
     WHERE next_attempt_at <= ? ORDER BY id LIMIT ?`,
    [Date.now(), limit]
  )) as { id: number; folder_type: string; file_url: string | null; file_name: string | null; attempts: number }[];
  return rows.map((r) => ({
    id: r.id,
    folderType: r.folder_type as MediaFolder,
    fileUrl: r.file_url,
    fileName: r.file_name,
    attempts: r.attempts,
  }));
}

/**
 * True if any remaining reel, episode or drama still points at this file
 * (matched by exact URL or by the B2 file name at the end of the URL).
 */
export async function isMediaFileStillUsed(fileUrl: string | null, fileName: string | null): Promise<boolean> {
  const db = await getDb();
  const url = fileUrl || "";
  const suffix = fileName ? `/${fileName}` : "\u0000"; // never matches when there's no name
  const row = (await db.get(
    `SELECT 1 AS used FROM (
       SELECT video_url AS u FROM reels WHERE video_url = ?1 OR instr(video_url, ?2) > 0
       UNION ALL SELECT thumbnail_url FROM reels WHERE thumbnail_url = ?1 OR instr(thumbnail_url, ?2) > 0
       UNION ALL SELECT url FROM episodes WHERE url = ?1 OR instr(url, ?2) > 0
       UNION ALL SELECT cover FROM dramas WHERE cover = ?1 OR instr(cover, ?2) > 0
     ) LIMIT 1`,
    [url, suffix]
  )) as { used: number } | undefined;
  return Boolean(row);
}

export async function completeB2Delete(id: number): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM b2_delete_queue WHERE id = ?", [id]);
}

export async function failB2Delete(id: number, attempts: number, error: string): Promise<void> {
  const db = await getDb();
  // Back off 1 min, 2, 4 … up to 1 day between attempts.
  const delayMs = Math.min(24 * 60 * 60 * 1000, 60_000 * 2 ** Math.min(attempts, 11));
  await db.run(
    "UPDATE b2_delete_queue SET attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE id = ?",
    [Date.now() + delayMs, error.slice(0, 500), id]
  );
}

export async function getB2DeleteQueueStats(): Promise<{ pending: number; failing: number; lastError: string | null }> {
  const db = await getDb();
  const row = (await db.get(
    `SELECT COUNT(*) AS pending,
            SUM(CASE WHEN attempts > 0 THEN 1 ELSE 0 END) AS failing,
            (SELECT last_error FROM b2_delete_queue WHERE last_error IS NOT NULL ORDER BY id DESC LIMIT 1) AS last_error
     FROM b2_delete_queue`
  )) as { pending: number; failing: number | null; last_error: string | null };
  return { pending: row.pending, failing: row.failing ?? 0, lastError: row.last_error };
}

/** Every media URL still in use (for the orphan scan). One round trip. */
export async function listReferencedMediaUrls(): Promise<string[]> {
  const db = await getDb();
  const results = await db.batch(
    [
      { sql: "SELECT video_url AS u FROM reels UNION ALL SELECT thumbnail_url FROM reels WHERE thumbnail_url IS NOT NULL" },
      { sql: "SELECT url AS u FROM episodes WHERE url IS NOT NULL" },
      { sql: "SELECT cover AS u FROM dramas WHERE cover IS NOT NULL" },
    ],
    "read"
  );
  return results.flat().map((r) => String((r as { u: unknown }).u || "")).filter(Boolean);
}

// ==========================================
// USER TRANSACTION HISTORY (paged)
// ==========================================

/** Opaque keyset cursors: base64url(JSON array of the last row's sort values). */
export function encodeCursor(values: (string | number)[]): string {
  return Buffer.from(JSON.stringify(values)).toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined, arity: number): (string | number)[] | null {
  if (!cursor) return null;
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return Array.isArray(v) && v.length === arity && v.every((x) => typeof x === "string" || typeof x === "number")
      ? v
      : null;
  } catch {
    return null;
  }
}

/** A user's own coin history, newest first, keyset-paged (stays fast however long the history gets). */
export async function listUserTransactions(
  userId: string,
  options: { cursor?: string | null; limit?: number } = {}
): Promise<{ items: CoinTransaction[]; nextCursor: string | null }> {
  const db = await getDb();
  const limit = Math.max(1, Math.min(options.limit ?? 30, 100));
  const after = decodeCursor(options.cursor, 2);
  const params: InValue[] = [userId];
  let where = "user_id = ?";
  if (after) {
    where += " AND (created_at < ? OR (created_at = ? AND id < ?))";
    params.push(after[0], after[0], after[1]);
  }
  params.push(limit + 1);
  const rows = (await db.all(
    `SELECT id, user_id, type, amount, description, created_at FROM coin_transactions
     WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
    params
  )) as TransactionRow[];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((t) => ({
      id: t.id,
      userId: t.user_id,
      type: t.type as CoinTransaction["type"],
      amount: t.amount,
      description: t.description,
      createdAt: t.created_at,
    })),
    nextCursor: rows.length > limit && last ? encodeCursor([last.created_at, last.id]) : null,
  };
}
