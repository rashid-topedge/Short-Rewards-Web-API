export type WatchHistoryItem = {
  dramaId: number;
  slug: string;
  title: string;
  cover: string | null;
  lastEpisode: number;
  totalEpisodes: number;
  lastWatchedAt: number;
  progressSeconds?: number;
  durationSeconds?: number;
};

const HISTORY_KEY = "drama_watch_history_v1";
const FAVORITES_KEY = "drama_favorites_v1";

export function getWatchHistory(): WatchHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchHistoryItem[];
    if (Array.isArray(parsed)) {
      return parsed.sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);
    }
    return [];
  } catch {
    return [];
  }
}

export function saveWatchProgress(item: Omit<WatchHistoryItem, "lastWatchedAt">) {
  if (typeof window === "undefined") return;
  try {
    const current = getWatchHistory().filter((i) => i.dramaId !== item.dramaId);
    const updated: WatchHistoryItem = {
      ...item,
      lastWatchedAt: Date.now(),
    };
    const next = [updated, ...current].slice(0, 20); // Keep top 20 recent
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Ignore localStorage errors
  }
}

export function getFavorites(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as number[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function toggleFavorite(dramaId: number): boolean {
  if (typeof window === "undefined") return false;
  try {
    const favorites = new Set(getFavorites());
    let isFav = false;
    if (favorites.has(dramaId)) {
      favorites.delete(dramaId);
      isFav = false;
    } else {
      favorites.add(dramaId);
      isFav = true;
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
    return isFav;
  } catch {
    return false;
  }
}

export function isDramaFavorite(dramaId: number): boolean {
  if (typeof window === "undefined") return false;
  return getFavorites().includes(dramaId);
}
