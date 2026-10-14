"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Flame,
  Heart,
  Share2,
  Check,
  Film,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Bookmark,
  Play,
  RotateCcw,
} from "lucide-react";

import { EpisodePlayer } from "@/components/EpisodePlayer";
import type { DramaDetail, EpisodeListResponse } from "@/lib/types";
import {
  saveWatchProgress,
  getWatchHistory,
  isDramaFavorite,
  toggleFavorite,
} from "@/lib/storage";

function formatCount(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

const PAGE_CHUNK_SIZE = 25;

export function DramaWatch({ dramaId }: { dramaId: string }) {
  const [state, setState] = useState<{
    dramaId: string;
    drama: DramaDetail | null;
    episodes: EpisodeListResponse["episodes"];
    selectedEp: number | null;
    error: string | null;
  }>({ dramaId: "", drama: null, episodes: [], selectedEp: null, error: null });

  const [activeChunk, setActiveChunk] = useState<number>(0); // 0 = 1..25, 1 = 26..50, -1 = all
  const [episodeSearch, setEpisodeSearch] = useState<string>("");
  const [showFullSynopsis, setShowFullSynopsis] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isTheater, setIsTheater] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [autoPlayNext, setAutoPlayNext] = useState(true);

  // Load drama & episodes
  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetch(`/api/dramas/${dramaId}`, { signal: controller.signal }),
      fetch(`/api/dramas/${dramaId}/episodes`, { signal: controller.signal }),
    ])
      .then(async ([dramaResponse, episodeResponse]) => {
        const dramaBody = (await dramaResponse.json()) as DramaDetail & { error?: string };
        const episodeBody = (await episodeResponse.json()) as EpisodeListResponse & {
          error?: string;
        };
        if (!dramaResponse.ok) throw new Error(dramaBody.error ?? "Drama not found");
        if (!episodeResponse.ok) throw new Error(episodeBody.error ?? "Could not load episodes");

        // Check if there's existing watch history for this drama
        const history = getWatchHistory();
        const existing = history.find((h) => h.dramaId === Number(dramaId));
        const firstPlayable = episodeBody.episodes.find((episode) => episode.playUrl);
        
        let startEp = firstPlayable?.ep ?? episodeBody.episodes[0]?.ep ?? null;
        if (existing && episodeBody.episodes.some((e) => e.ep === existing.lastEpisode)) {
          startEp = existing.lastEpisode;
        }

        // Set initial chunk to match the starting episode
        if (startEp && startEp > 25) {
          setActiveChunk(Math.floor((startEp - 1) / PAGE_CHUNK_SIZE));
        }

        setState({
          dramaId,
          drama: dramaBody,
          episodes: episodeBody.episodes,
          selectedEp: startEp,
          error: null,
        });

        setIsFavorite(isDramaFavorite(Number(dramaId)));
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({
          dramaId,
          drama: null,
          episodes: [],
          selectedEp: null,
          error: err instanceof Error ? err.message : "Could not load drama",
        });
      });

    return () => controller.abort();
  }, [dramaId]);

  // Save history on episode change
  useEffect(() => {
    if (state.drama && state.selectedEp) {
      saveWatchProgress({
        dramaId: state.drama.dramaId,
        slug: state.drama.slug,
        title: state.drama.title || "Untitled Drama",
        cover: state.drama.cover,
        lastEpisode: state.selectedEp,
        totalEpisodes: state.drama.episodeCount || state.episodes.length,
      });
    }
  }, [state.drama, state.selectedEp, state.episodes.length]);

  const ready = state.dramaId === dramaId;
  const drama = ready ? state.drama : null;
  const episodes = ready ? state.episodes : [];
  const selectedEp = ready ? state.selectedEp : null;
  const error = ready ? state.error : null;
  const loading = !ready;

  const currentIndex = episodes.findIndex((e) => e.ep === selectedEp);
  const selected = currentIndex >= 0 ? episodes[currentIndex] : null;
  const hasPrevEpisode = currentIndex > 0;
  const hasNextEpisode = currentIndex >= 0 && currentIndex < episodes.length - 1;

  const handleNextEpisode = () => {
    if (hasNextEpisode) {
      const nextEp = episodes[currentIndex + 1].ep;
      setState((cur) => ({ ...cur, selectedEp: nextEp }));
      // Adjust active tab if next episode is in next chunk
      const nextChunk = Math.floor((nextEp - 1) / PAGE_CHUNK_SIZE);
      if (nextChunk !== activeChunk && activeChunk !== -1) {
        setActiveChunk(nextChunk);
      }
    }
  };

  const handlePrevEpisode = () => {
    if (hasPrevEpisode) {
      const prevEp = episodes[currentIndex - 1].ep;
      setState((cur) => ({ ...cur, selectedEp: prevEp }));
      const prevChunk = Math.floor((prevEp - 1) / PAGE_CHUNK_SIZE);
      if (prevChunk !== activeChunk && activeChunk !== -1) {
        setActiveChunk(prevChunk);
      }
    }
  };

  const handleToggleFav = () => {
    if (drama) {
      const updated = toggleFavorite(drama.dramaId);
      setIsFavorite(updated);
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      }
    } catch {
      // Ignore copy error
    }
  };

  // Chunking tabs for large episode lists
  const totalChunks = Math.ceil(episodes.length / PAGE_CHUNK_SIZE);

  const displayedEpisodes = useMemo(() => {
    if (episodeSearch.trim()) {
      const queryNum = parseInt(episodeSearch.trim(), 10);
      if (!isNaN(queryNum)) {
        return episodes.filter((e) => e.ep.toString().includes(episodeSearch.trim()));
      }
    }
    if (activeChunk === -1 || totalChunks <= 1) {
      return episodes;
    }
    const start = activeChunk * PAGE_CHUNK_SIZE;
    return episodes.slice(start, start + PAGE_CHUNK_SIZE);
  }, [episodes, activeChunk, totalChunks, episodeSearch]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="group inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-zinc-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          <span>Back to Catalog</span>
        </Link>

        {drama && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleFav}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                isFavorite
                  ? "border-rose-500/30 bg-rose-500/15 text-rose-300"
                  : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Heart
                className={`h-3.5 w-3.5 ${isFavorite ? "fill-rose-400 text-rose-400" : ""}`}
              />
              <span>{isFavorite ? "Favorited" : "Favorite"}</span>
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-400 transition-all hover:bg-white/10 hover:text-white"
            >
              {shareCopied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Share</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Loading & Error States */}
      {loading && !drama && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-sm text-zinc-400 font-medium">Loading drama & stream player...</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-400">
          <RotateCcw className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Unable to load drama</p>
            <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {drama && (
        <div
          className={`grid gap-8 ${
            isTheater ? "grid-cols-1" : "lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]"
          }`}
        >
          {/* Main Player & Drama Details Column */}
          <div className="flex flex-col gap-6 min-w-0">
            {/* Active Playing Episode Header */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                  Now Streaming
                </span>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span>{drama.title || "Untitled Drama"}</span>
                  {selected && (
                    <span className="text-sm font-semibold text-zinc-400 bg-white/10 rounded-lg px-2.5 py-0.5 border border-white/10">
                      Ep {selected.ep}
                    </span>
                  )}
                </h2>
              </div>
            </div>

            {/* Video Player */}
            {selected?.playUrl ? (
              <EpisodePlayer
                src={selected.playUrl}
                poster={drama.cover}
                hasNextEpisode={hasNextEpisode}
                hasPrevEpisode={hasPrevEpisode}
                onNextEpisode={handleNextEpisode}
                onPrevEpisode={handlePrevEpisode}
                autoPlayNext={autoPlayNext}
                onAutoPlayToggle={setAutoPlayNext}
                isTheater={isTheater}
                onToggleTheater={() => setIsTheater(!isTheater)}
              />
            ) : (
              <div className="flex aspect-video w-full flex-col items-center justify-center rounded-2xl border border-white/10 bg-zinc-950 p-6 text-center text-zinc-400 shadow-xl">
                <Film className="h-10 w-10 text-zinc-600 mb-2" />
                <p className="text-sm font-semibold text-zinc-300">
                  {selected
                    ? `Episode ${selected.ep} stream is currently unavailable.`
                    : "No playable episodes found for this drama."}
                </p>
                <p className="text-xs text-zinc-500 mt-1">Please select another episode.</p>
              </div>
            )}

            {/* Drama Details Card */}
            <div className="flex flex-col gap-5 rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5 sm:p-6 backdrop-blur-md shadow-xl">
              <div className="flex flex-col sm:flex-row gap-5">
                {/* Mini Cover Thumbnail */}
                <div className="w-24 shrink-0 aspect-[2/3] overflow-hidden rounded-xl bg-zinc-950 border border-white/10 hidden sm:block">
                  {drama.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={drama.cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Film className="h-6 w-6 text-zinc-700" />
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="flex items-center gap-1 rounded-full bg-violet-500/15 border border-violet-500/30 px-3 py-1 font-semibold text-violet-300">
                      <Layers className="h-3.5 w-3.5" />
                      {drama.episodeCount} Episodes
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/20 px-3 py-1 font-semibold text-rose-300">
                      <Flame className="h-3.5 w-3.5" />
                      {formatCount(drama.playCount)} Plays
                    </span>
                    {drama.latestEpisodeLabel && (
                      <span className="rounded-full bg-white/10 px-3 py-1 font-medium text-zinc-300">
                        {drama.latestEpisodeLabel}
                      </span>
                    )}
                  </div>

                  {/* Tags */}
                  {drama.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {drama.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-lg bg-zinc-800/90 border border-white/5 px-2.5 py-0.5 text-xs text-zinc-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Synopsis */}
                  {drama.synopsis && (
                    <div className="flex flex-col gap-1.5 pt-1">
                      <p
                        className={`text-xs sm:text-sm text-zinc-300 leading-relaxed ${
                          !showFullSynopsis ? "line-clamp-3" : ""
                        }`}
                      >
                        {drama.synopsis}
                      </p>
                      {drama.synopsis.length > 180 && (
                        <button
                          type="button"
                          onClick={() => setShowFullSynopsis(!showFullSynopsis)}
                          className="flex items-center gap-1 text-xs font-semibold text-violet-400 hover:text-violet-300 self-start"
                        >
                          <span>{showFullSynopsis ? "Show less" : "Read full synopsis"}</span>
                          {showFullSynopsis ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Episode Playlist Sidebar Drawer */}
          <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-4 sm:p-5 backdrop-blur-md shadow-xl h-fit">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-violet-400" />
                <h3 className="font-bold text-white text-sm sm:text-base">Episode Playlist</h3>
              </div>
              <span className="text-xs text-zinc-400 font-medium">
                {episodes.length} Episodes Total
              </span>
            </div>

            {/* Episode Search / Filter */}
            <div className="relative">
              <input
                type="text"
                placeholder="Jump to episode #..."
                value={episodeSearch}
                onChange={(e) => setEpisodeSearch(e.target.value)}
                className="h-9 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-500"
              />
            </div>

            {/* Pagination Range Tabs (for > 25 episodes) */}
            {totalChunks > 1 && !episodeSearch && (
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none text-xs">
                {Array.from({ length: totalChunks }).map((_, idx) => {
                  const start = idx * PAGE_CHUNK_SIZE + 1;
                  const end = Math.min((idx + 1) * PAGE_CHUNK_SIZE, episodes.length);
                  const isSelected = activeChunk === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveChunk(idx)}
                      className={`rounded-lg px-2.5 py-1 font-semibold whitespace-nowrap transition-all ${
                        isSelected
                          ? "bg-violet-600 text-white shadow-sm shadow-violet-600/50"
                          : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                      }`}
                    >
                      {start}-{end}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setActiveChunk(-1)}
                  className={`rounded-lg px-2.5 py-1 font-semibold whitespace-nowrap transition-all ${
                    activeChunk === -1
                      ? "bg-violet-600 text-white"
                      : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                  }`}
                >
                  All
                </button>
              </div>
            )}

            {/* Episode Buttons Grid */}
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-[460px] overflow-y-auto pr-1">
              {displayedEpisodes.map((episode) => {
                const isActive = episode.ep === selectedEp;
                const isPlayable = Boolean(episode.playUrl);

                return (
                  <button
                    key={episode.ep}
                    type="button"
                    onClick={() =>
                      setState((current) =>
                        current.dramaId === dramaId
                          ? { ...current, selectedEp: episode.ep }
                          : current,
                      )
                    }
                    className={`relative flex h-11 flex-col items-center justify-center rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/30 ring-2 ring-violet-400"
                        : "bg-zinc-800/80 text-zinc-300 border border-white/5 hover:bg-zinc-700/80 hover:text-white"
                    } ${!isPlayable ? "opacity-40" : ""}`}
                    title={
                      isPlayable ? `Play Episode ${episode.ep}` : "Stream URL not available"
                    }
                  >
                    <span>{episode.ep}</span>

                    {/* Equalizer Wave Indicator if actively selected */}
                    {isActive && (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        <span className="w-0.5 bg-white rounded-full animate-eq-1" />
                        <span className="w-0.5 bg-white rounded-full animate-eq-2" />
                        <span className="w-0.5 bg-white rounded-full animate-eq-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
