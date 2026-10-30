export type DramaCard = {
  dramaId: number;
  slug: string;
  title: string | null;
  cover: string | null;
  playCount: number;
  episodeCount: number;
  latestEpisodeLabel: string | null;
  isPublished?: boolean;
};

export type DramaListResponse = {
  limit: number;
  nextCursor: string | null;
  items: DramaCard[];
};

export type DramaDetail = {
  dramaId: number;
  slug: string;
  title: string | null;
  cover: string | null;
  synopsis: string | null;
  tags: string[];
  playCount: number;
  likeCount: number;
  episodeCount: number;
  latestEpisodeLabel: string | null;
  isPublished?: boolean;
};

export type EpisodeItem = {
  ep: number;
  playUrl: string | null;
  isPublished?: boolean;
};

export type EpisodeListResponse = {
  dramaId: number;
  episodes: EpisodeItem[];
};

export type ReelItem = {
  reelId: number;
  title: string;
  synopsis?: string | null;
  videoUrl: string;
  thumbnailUrl?: string | null;
  durationSeconds: number;
  dramaId?: number | null;
  dramaTitle?: string | null;
  episodeNumber?: number | null;
  tags: string[];
  viewCount: number;
  likeCount: number;
  isPublished: boolean;
  createdAt: number;
  updatedAt: number;
};

/** Fields a moderator may change on a reel (also the shape of pending changes). */
export type ReelChanges = {
  title?: string;
  synopsis?: string | null;
  tags?: string[];
  videoUrl?: string;
  thumbnailUrl?: string | null;
  durationSeconds?: number;
  dramaId?: number | null;
  episodeNumber?: number | null;
};

/** null = admin-managed/approved; otherwise a moderator reel's review state. */
export type ReelReviewStatus = "draft" | "pending" | "rejected" | null;

/** What the signed-in staff member may do with a reel (computed by the server). */
export type ReelPermissions = {
  canEdit: boolean;
  canDelete: boolean;
  /** Admin: publish/unpublish freely. */
  canTogglePublish: boolean;
  /** Moderator: hide own live reel. */
  canUnpublish: boolean;
  /** Moderator: send own draft/rejected reel for approval. */
  canSubmit: boolean;
  /** Admin: approve/reject a pending reel or pending changes. */
  canReview: boolean;
};

/** A reel as the admin console sees it. */
export type AdminReelItem = ReelItem & {
  createdById: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  reviewStatus: ReelReviewStatus;
  reviewNote: string | null;
  firstPublishedAt: number | null;
  pendingChanges: ReelChanges | null;
  pendingByName: string | null;
  pendingAt: number | null;
  permissions?: ReelPermissions;
  previewVideoUrl?: string;
  previewThumbnailUrl?: string | null;
  /** Signed preview links for a proposed new video/thumbnail. */
  pendingPreview?: { videoUrl: string | null; thumbnailUrl: string | null } | null;
};

export type StaffAccountInfo = {
  id: number;
  username: string;
  displayName: string;
  disabled: boolean;
  createdAt: number;
  lastLoginAt: number | null;
};

export type ActivityEntry = {
  id: number;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  createdAt: number;
};

export type ReelListResponse = {
  limit: number;
  nextCursor: string | null;
  total?: number;
  items: ReelItem[];
};

export type CoinTransaction = {
  id: number;
  userId: string;
  type:
    | "DAILY_CHECKIN"
    | "EPISODE_WATCHED"
    | "REWARD_AD"
    | "REEL_WATCHED"
    | "SIGNUP_BONUS"
    | "SPEND"
    | "ADMIN_ADJUSTMENT"
    | "REFERRAL_REFERRER"
    | "REFERRAL_REFEREE";
  amount: number;
  description: string;
  createdAt: number;
};

export type StreakDayInfo = {
  day: number;
  coins: number;
  status: "claimed" | "available" | "locked";
};

export type UserProfile = {
  userId: string;
  coins: number;
  streakDay: number;
  lastCheckInDate: string | null;
  /** True once the user has linked a Google account (needed to recover the account on a new device). */
  googleLinked?: boolean;
  googleEmail?: string | null;
  canCheckInToday: boolean;
  nextCheckInReward: number;
  streakSchedule: StreakDayInfo[];
  transactions: CoinTransaction[];
};

/** Set on claim responses that didn't grant coins (or replayed an earlier claim). */
type ClaimMeta = {
  /**
   * ALREADY_CLAIMED (409), DAILY_LIMIT / COOLDOWN (429), CLAIM_ID_REUSED (422),
   * reels only: REEL_NOT_FOUND (404), TOO_EARLY (425), INVALID_WATCH_TOKEN / WATCH_TOKEN_REQUIRED (400).
   */
  code?:
    | "ALREADY_CLAIMED"
    | "DAILY_LIMIT"
    | "COOLDOWN"
    | "CLAIM_ID_REUSED"
    | "REEL_NOT_FOUND"
    | "TOO_EARLY"
    | "INVALID_WATCH_TOKEN"
    | "WATCH_TOKEN_REQUIRED";
  alreadyClaimed?: boolean;
  /** True when this is the stored answer to a claim ID that was already processed. */
  replayed?: boolean;
  /** Coins paid to this user because their referral qualified with this claim. */
  referralBonus?: number;
};

export type CheckInResult = ClaimMeta & {
  success: boolean;
  message: string;
  coinsEarned: number;
  newCoinsBalance: number;
  streakDay: number;
  isCycleReset: boolean;
  user: UserProfile;
};

export type RewardResult = ClaimMeta & {
  success: boolean;
  message: string;
  coinsEarned: number;
  newCoinsBalance: number;
  /** Set when the reward was refused because of a daily cap or cooldown. */
  limitReason?: "LIMIT" | "COOLDOWN";
  retryAfterSeconds?: number;
  /** Reels: the reel's length, and whether it paid by length or the no-watch-token amount. */
  reelSeconds?: number;
  paidBy?: string;
  user: UserProfile;
};

export type RedemptionStatus = "PENDING" | "PAID" | "REJECTED";

export type RedemptionRequest = {
  id: number;
  userId: string;
  coinsAmount: number;
  exchangeRate: number;
  pkrAmount: number;
  paymentMethod: string;
  accountTitle: string;
  accountNumber: string;
  bankName?: string | null;
  status: RedemptionStatus;
  transactionRef?: string | null;
  receiptUrl?: string | null;
  adminNotes?: string | null;
  createdAt: number;
  processedAt?: number | null;
};

export type SystemSettings = {
  coinToPkrRate: number;
  minRedeemCoins: number;
  maxAdRewardsPerDay: number;
  adRewardCooldownSeconds: number;
  maxReelRewardsPerDay: number;
  s3Endpoint: string;
  s3Bucket: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3PublicUrl: string;

  // Multi-account B2 config (optional per-folder overrides)
  b2DramasKeyId?: string;
  b2DramasAppKey?: string;
  b2DramasBucketId?: string;
  b2DramasPublicUrl?: string;
  b2ReelsKeyId?: string;
  b2ReelsAppKey?: string;
  b2ReelsBucketId?: string;
  b2ReelsPublicUrl?: string;
  b2PayoutsKeyId?: string;
  b2PayoutsAppKey?: string;
  b2PayoutsBucketId?: string;
  b2PayoutsPublicUrl?: string;
};

export type AdminDashboardStats = {
  totalDramas: number;
  publishedDramas: number;
  draftDramas: number;
  totalEpisodes: number;
  publishedEpisodes: number;
  totalReels: number;
  publishedReels: number;
  draftReels: number;
  totalUsers: number;
  totalCoinsInCirculation: number;
  totalTransactions: number;
  activeStreaksCount: number;
  pendingRedemptionsCount: number;
  pendingRedemptionsPkr: number;
  totalPaidPkr: number;
  recentTransactions: CoinTransaction[];
  recentUsers: UserProfile[];
};
