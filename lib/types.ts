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

export type ReelListResponse = {
  limit: number;
  nextCursor: string | null;
  total?: number;
  items: ReelItem[];
};

export type CoinTransaction = {
  id: number;
  userId: string;
  type: "DAILY_CHECKIN" | "EPISODE_WATCHED" | "REWARD_AD" | "REEL_WATCHED" | "SIGNUP_BONUS" | "SPEND" | "ADMIN_ADJUSTMENT";
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
  canCheckInToday: boolean;
  nextCheckInReward: number;
  streakSchedule: StreakDayInfo[];
  transactions: CoinTransaction[];
};

export type CheckInResult = {
  success: boolean;
  message: string;
  coinsEarned: number;
  newCoinsBalance: number;
  streakDay: number;
  isCycleReset: boolean;
  user: UserProfile;
};

export type RewardResult = {
  success: boolean;
  message: string;
  coinsEarned: number;
  newCoinsBalance: number;
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
