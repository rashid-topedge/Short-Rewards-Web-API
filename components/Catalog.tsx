"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  X,
  Play,
  Flame,
  Film,
  Sparkles,
  ChevronRight,
  RotateCcw,
  SlidersHorizontal,
  Clock,
  Layers,
} from "lucide-react";

import type { DramaCard, DramaListResponse } from "@/lib/types";
import { getWatchHistory, WatchHistoryItem } from "@/lib/storage";

function formatCount(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

const POPULAR_GENRES = [
  "All",
  "Romance",
  "Revenge",
  "CEO",
  "Urban",
  "Family",
  "Fantasy",
  "Suspense",
  "Billionaire",
];

type SortOption = "popular" | "episodes" | "title";

type CatalogState = {
  query: string;
  items: DramaCard[];
  nextCursor: string | null;
  error: string | null;
  loading: boolean;
  loadingMore: boolean;
};

export function Catalog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.get("q") ?? "";

  const [activeGenre, setActiveGenre] = useState<string>("All");
  const [sortBy, setSortBy] = useState<SortOption>("popular");
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<CatalogState>({
    query: "",
    items: [],
    nextCursor: null,
    error: null,
    loading: true,
    loadingMore: false,
  });

  // Load continue watching history
  useEffect(() => {
    setHistory(getWatchHistory());
  }, []);

  // Keyboard shortcut '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch dramas from API
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "24" });
    if (rawQuery) params.set("q", rawQuery);

    fetch(`/api/dramas?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as DramaListResponse & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Could not load dramas");
        setState({
          query: rawQuery,
          items: body.items,
          nextCursor: body.nextCursor,
          error: null,
          loading: false,
          loadingMore: false,
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({
          query: rawQuery,
          items: [],
          nextCursor: null,
          error: err instanceof Error ? err.message : "Could not load dramas",
          loading: false,
          loadingMore: false,
        });
      });

    return () => controller.abort();
  }, [rawQuery]);

  function setSearch(nextQuery: string) {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    const suffix = params.toString();
    router.push(suffix ? `/?${suffix}` : "/");
  }

  function handleGenreClick(genre: string) {
    setActiveGenre(genre);
    if (genre === "All") {
      setSearch("");
    } else {
      setSearch(genre);
    }
  }

  async function loadMore() {
    if (!state.nextCursor || state.loadingMore || state.query !== rawQuery) return;

    const cursor = state.nextCursor;
    setState((current) => ({ ...current, loadingMore: true, error: null }));

    try {
      const params = new URLSearchParams({ limit: "24", cursor });
      if (rawQuery) params.set("q", rawQuery);
      const response = await fetch(`/api/dramas?${params}`);
      const body = (await response.json()) as DramaListResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not load more dramas");

      setState((current) => {
        if (current.query !== rawQuery || current.nextCursor !== cursor) return current;
        const seen = new Set(current.items.map((item) => item.dramaId));
        const appended = body.items.filter((item) => !seen.has(item.dramaId));
        return {
          ...current,
          items: [...current.items, ...appended],
          nextCursor: body.nextCursor,
          loadingMore: false,
          error: null,
        };
      });
    } catch (err: unknown) {
      setState((current) => ({
        ...current,
        loadingMore: false,
        error: err instanceof Error ? err.message : "Could not load more dramas",
      }));
    }
  }

  const ready = state.query === rawQuery;
  const rawItems = ready ? state.items : [];
  const nextCursor = ready ? state.nextCursor : null;
  const error = ready ? state.error : null;
  const loading = !ready || state.loading;
  const loadingMore = ready && state.loadingMore;

  // Client-side sorting
  const items = useMemo(() => {
    const list = [...rawItems];
    if (sortBy === "popular") {
      return list.sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
    }
    if (sortBy === "episodes") {
      return list.sort((a, b) => (b.episodeCount ?? 0) - (a.episodeCount ?? 0));
    }
    if (sortBy === "title") {
      return list.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
    }
    return list;
  }, [rawItems, sortBy]);

  // Spotlight Drama (First drama in list if not actively searching)
  const spotlight = !rawQuery && items.length > 0 ? items[0] : null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero Spotlight Banner */}
      {spotlight && !loading && (
        <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-r from-zinc-950 via-zinc-900/90 to-zinc-950 p-6 sm:p-10 shadow-2xl">
          {/* Cover background glow */}
          {spotlight.cover && (
            <div
              className="absolute -right-20 -top-20 h-[120%] w-[60%] opacity-20 blur-3xl pointer-events-none"
              style={{
                backgroundImage: `url(${spotlight.cover})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          )}

          <div className="relative z-10 flex flex-col-reverse gap-8 md:flex-row md:items-center md:justify-between">
            <div className="flex max-w-2xl flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  Featured Spotlight
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-zinc-300">
                  {spotlight.episodeCount} Episodes
                </span>
                <span className="flex items-center gap-1 text-xs font-medium text-zinc-400">
                  <Flame className="h-3.5 w-3.5 text-rose-400" />
                  {formatCount(spotlight.playCount)} plays
                </span>
              </div>

              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white line-clamp-2">
                {spotlight.title || "Untitled Drama"}
              </h1>

              <p className="text-sm text-zinc-400 line-clamp-3 leading-relaxed">
                Dive into this popular short drama series. Experience high-octane twists, rapid
                character arcs, and engaging cliffhangers streamable in HD.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  href={`/drama/${spotlight.dramaId}`}
                  className="inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition-all hover:scale-105 hover:shadow-violet-500/50"
                >
                  <Play className="h-4 w-4 fill-white" />
                  Watch Now
                </Link>
                <Link
                  href={`/drama/${spotlight.dramaId}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-medium text-zinc-200 backdrop-blur-sm transition-all hover:bg-white/10"
                >
                  View Details
                  <ChevronRight className="h-4 w-4 text-zinc-400" />
                </Link>
              </div>
            </div>

            {/* Spotlight Cover Poster */}
            <div className="relative mx-auto md:mx-0 w-44 sm:w-52 shrink-0 aspect-[2/3] overflow-hidden rounded-2xl border border-white/15 shadow-2xl shadow-violet-950/40 group">
              {spotlight.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={spotlight.cover}
                  alt={spotlight.title || "Cover"}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-zinc-900">
                  <Film className="h-10 w-10 text-zinc-600" />
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Continue Watching Carousel */}
      {history.length > 0 && !rawQuery && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-violet-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">Continue Watching</h2>
            </div>
            <span className="text-xs text-zinc-500">{history.length} in progress</span>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none snap-x">
            {history.map((item) => (
              <Link
                key={item.dramaId}
                href={`/drama/${item.dramaId}`}
                className="group relative flex w-64 shrink-0 snap-start flex-col gap-2 rounded-xl border border-white/10 bg-zinc-900/70 p-2.5 transition-all hover:border-violet-500/40 hover:bg-zinc-800/80"
              >
                <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-zinc-950">
                  {item.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.cover}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-900">
                      <Film className="h-6 w-6 text-zinc-700" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg">
                      <Play className="h-4 w-4 fill-white translate-x-0.5" />
                    </div>
                  </div>
                  <div className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-violet-300 backdrop-blur-xs">
                    Ep {item.lastEpisode}
                  </div>
                </div>

                <div className="flex flex-col">
                  <h3 className="line-clamp-1 text-xs font-semibold text-zinc-200 group-hover:text-white">
                    {item.title}
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Last watched episode {item.lastEpisode} of {item.totalEpisodes}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Discovery & Search Header */}
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Film className="h-6 w-6 text-violet-400" />
              {rawQuery ? `Results for "${rawQuery}"` : "All Dramas"}
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400">
              {items.length} titles available • Instant buffer-free streaming
            </p>
          </div>

          {/* Search Bar */}
          <form
            key={rawQuery}
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const field = new FormData(event.currentTarget).get("q");
              setSearch(typeof field === "string" ? field : "");
            }}
            className="relative flex w-full max-w-md items-center"
          >
            <Search className="absolute left-3.5 h-4 w-4 text-zinc-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              name="q"
              defaultValue={rawQuery}
              placeholder="Search dramas, genres, or keywords..."
              aria-label="Search titles"
              className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900/90 pl-10 pr-20 text-sm text-white placeholder-zinc-500 shadow-inner outline-none transition-all focus:border-violet-500 focus:bg-zinc-900 focus:ring-2 focus:ring-violet-500/20"
            />
            {rawQuery ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-12 flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="absolute right-12 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 border border-zinc-700/50">
                /
              </span>
            )}
            <button
              type="submit"
              className="absolute right-1.5 h-8 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white shadow transition-all hover:bg-violet-500"
            >
              Go
            </button>
          </form>
        </div>

        {/* Category Pills & Sorting Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-y border-white/[0.06] py-3">
          {/* Genre Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {POPULAR_GENRES.map((genre) => {
              const isSelected = activeGenre === genre && (!rawQuery || rawQuery.toLowerCase() === genre.toLowerCase());
              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() => handleGenreClick(genre)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                    isSelected
                      ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                      : "bg-zinc-900/80 text-zinc-400 border border-white/[0.06] hover:bg-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  {genre}
                </button>
              );
            })}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-zinc-400">
            <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-500" />
            <span>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 outline-none focus:border-violet-500"
            >
              <option value="popular">Most Popular</option>
              <option value="episodes">Most Episodes</option>
              <option value="title">Alphabetical</option>
            </select>
          </div>
        </div>
      </section>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <RotateCcw className="h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Drama Grid */}
      <section>
        {loading && items.length === 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className="flex flex-col gap-2 rounded-2xl border border-white/[0.06] bg-zinc-900/50 p-2"
              >
                <div className="aspect-[2/3] w-full rounded-xl animate-shimmer bg-zinc-800" />
                <div className="h-4 w-3/4 rounded-md animate-shimmer bg-zinc-800 mt-1" />
                <div className="h-3 w-1/2 rounded-md animate-shimmer bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : items.length > 0 ? (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {items.map((drama) => (
              <li key={drama.dramaId}>
                <Link
                  href={`/drama/${drama.dramaId}`}
                  className="group relative flex h-full flex-col gap-2.5 rounded-2xl border border-white/[0.06] bg-zinc-900/40 p-2 transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/40 hover:bg-zinc-900/90 hover:shadow-xl hover:shadow-violet-950/30"
                >
                  {/* Poster Image Container */}
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-zinc-950">
                    {drama.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={drama.cover}
                        alt={drama.title || "Poster"}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-950 to-violet-950/40 p-4 text-center">
                        <Film className="h-8 w-8 text-zinc-600 mb-2" />
                        <span className="text-[11px] font-medium text-zinc-400 line-clamp-2">
                          {drama.title || "Drama"}
                        </span>
                      </div>
                    )}

                    {/* Gradient overlay on bottom */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />

                    {/* Hover Play button badge */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/50 transition-transform duration-300 group-hover:scale-110">
                        <Play className="h-5 w-5 fill-white translate-x-0.5" />
                      </div>
                    </div>

                    {/* Top Episode Badge */}
                    <div className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-zinc-200 backdrop-blur-md border border-white/10">
                      {drama.episodeCount} eps
                    </div>

                    {/* Bottom Play Count */}
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] font-medium text-zinc-300">
                      <span className="flex items-center gap-1">
                        <Flame className="h-3 w-3 text-rose-400" />
                        {formatCount(drama.playCount)}
                      </span>
                      {drama.latestEpisodeLabel && (
                        <span className="text-[10px] text-violet-300 font-normal truncate max-w-[90px]">
                          {drama.latestEpisodeLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title & Metadata */}
                  <div className="flex flex-col gap-1 px-1 pb-1">
                    <h3 className="line-clamp-2 text-xs sm:text-sm font-semibold text-zinc-100 transition-colors group-hover:text-violet-300">
                      {drama.title || "Untitled"}
                    </h3>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-zinc-900/30 py-16 px-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800/80 text-zinc-400 mb-4">
              <Film className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-white">No dramas found</h3>
            <p className="mt-1 max-w-sm text-xs sm:text-sm text-zinc-400">
              We couldn&apos;t find any dramas matching your search. Try checking your spelling or
              explore other categories.
            </p>
            {rawQuery && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-5 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-white/20"
              >
                Clear search & view all
              </button>
            )}
          </div>
        )}
      </section>

      {/* Pagination / Load More */}
      {nextCursor && (
        <div className="flex flex-col items-center justify-center gap-2 py-4">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="group inline-flex items-center gap-2 rounded-xl border border-white/15 bg-zinc-900/90 px-8 py-3 text-sm font-semibold text-zinc-200 shadow-lg backdrop-blur-md transition-all hover:border-violet-500/50 hover:bg-zinc-800 hover:text-white disabled:opacity-50"
          >
            {loadingMore ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                <span>Loading more dramas...</span>
              </>
            ) : (
              <>
                <span>Load More Dramas</span>
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
          <span className="text-xs text-zinc-500">Showing {items.length} dramas</span>
        </div>
      )}
    </div>
  );
}
