"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import {
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  Gauge,
  Play,
  Pause,
  AlertCircle,
  Minimize2,
  Maximize2,
} from "lucide-react";

function isHlsUrl(url: string) {
  return /\.m3u8($|\?)/i.test(url);
}

const SPEED_OPTIONS = [1.0, 1.25, 1.5, 2.0];
const VOLUME_STORAGE_KEY = "drama_player_volume_v1";

type VolumePrefs = { volume: number; muted: boolean };

function readVolumePrefs(): VolumePrefs {
  if (typeof window === "undefined") return { volume: 1, muted: false };
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (!raw) return { volume: 1, muted: false };
    const parsed = JSON.parse(raw) as Partial<VolumePrefs>;
    const volume =
      typeof parsed.volume === "number" && Number.isFinite(parsed.volume)
        ? Math.min(1, Math.max(0, parsed.volume))
        : 1;
    return { volume, muted: Boolean(parsed.muted) };
  } catch {
    return { volume: 1, muted: false };
  }
}

function writeVolumePrefs(prefs: VolumePrefs) {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function applyVolumePrefs(video: HTMLVideoElement, prefs: VolumePrefs) {
  video.volume = prefs.volume;
  video.muted = prefs.muted;
}

type VideoWithWebkit = HTMLVideoElement & {
  webkitDisplayingFullscreen?: boolean;
  webkitEnterFullscreen?: () => void;
};

function isVideoFullscreen(video: HTMLVideoElement | null): boolean {
  if (!video) return false;
  if ((video as VideoWithWebkit).webkitDisplayingFullscreen) return true;
  const fs = document.fullscreenElement;
  return Boolean(fs && (fs === video || fs.contains(video) || video.contains(fs)));
}

function enterVideoFullscreen(video: HTMLVideoElement) {
  if (isVideoFullscreen(video)) return;
  const webkitVideo = video as VideoWithWebkit;
  if (typeof webkitVideo.webkitEnterFullscreen === "function") {
    try {
      webkitVideo.webkitEnterFullscreen();
      return;
    } catch {
      // Fall through to the standard Fullscreen API.
    }
  }
  if (typeof video.requestFullscreen === "function") {
    void video.requestFullscreen().catch(() => {});
  }
}

type EpisodePlayerProps = {
  src: string;
  poster?: string | null;
  onNextEpisode?: () => void;
  onPrevEpisode?: () => void;
  hasNextEpisode?: boolean;
  hasPrevEpisode?: boolean;
  autoPlayNext?: boolean;
  onAutoPlayToggle?: (val: boolean) => void;
  initialTime?: number;
  onProgress?: (currentTime: number, duration: number) => void;
  isTheater?: boolean;
  onToggleTheater?: () => void;
};

export function EpisodePlayer({
  src,
  poster,
  onNextEpisode,
  onPrevEpisode,
  hasNextEpisode = false,
  hasPrevEpisode = false,
  autoPlayNext = true,
  onAutoPlayToggle,
  initialTime = 0,
  onProgress,
  isTheater = false,
  onToggleTheater,
}: EpisodePlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playbackSpeedRef = useRef(1.0);
  const persistFullscreenRef = useRef(false);
  const sourceSwitchRef = useRef(false);
  const restorePlaybackRef = useRef<() => void>(() => {});
  const volumeRef = useRef<VolumePrefs>({ volume: 1, muted: false });
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasAutoSeeked, setHasAutoSeeked] = useState(false);

  playbackSpeedRef.current = playbackSpeed;

  useEffect(() => {
    volumeRef.current = readVolumePrefs();
    const video = videoRef.current;
    if (!video) return;

    applyVolumePrefs(video, volumeRef.current);

    const onVolumeChange = () => {
      volumeRef.current = { volume: video.volume, muted: video.muted };
      writeVolumePrefs(volumeRef.current);
    };
    video.addEventListener("volumechange", onVolumeChange);
    return () => video.removeEventListener("volumechange", onVolumeChange);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    sourceSwitchRef.current = true;
    const keepFullscreen = persistFullscreenRef.current || isVideoFullscreen(video);
    persistFullscreenRef.current = keepFullscreen;
    applyVolumePrefs(video, volumeRef.current);

    setError(null);
    setHasAutoSeeked(false);

    const restorePlayback = () => {
      video.playbackRate = playbackSpeedRef.current;
      applyVolumePrefs(video, volumeRef.current);
      void video
        .play()
        .then(() => {
          if (persistFullscreenRef.current) enterVideoFullscreen(video);
        })
        .catch(() => {
          if (persistFullscreenRef.current) enterVideoFullscreen(video);
        })
        .finally(() => {
          window.setTimeout(() => {
            sourceSwitchRef.current = false;
          }, 400);
        });
    };
    restorePlaybackRef.current = restorePlayback;

    const attachHlsErrors = (hlsInstance: Hls) => {
      hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            setError("Network connection issue while loading stream.");
            hlsInstance.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            setError("Media decoding error. Recovering...");
            hlsInstance.recoverMediaError();
            break;
          default:
            setError("Fatal stream playback error.");
            hlsInstance.destroy();
            if (hlsRef.current === hlsInstance) {
              hlsRef.current = null;
            }
            break;
        }
      });
    };

    if (!isHlsUrl(src) || video.canPlayType("application/vnd.apple.mpegurl")) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      const onReady = () => restorePlayback();
      video.addEventListener("loadedmetadata", onReady, { once: true });
      video.src = src;
      return () => video.removeEventListener("loadedmetadata", onReady);
    }

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.loadSource(src);
        return;
      }
      const hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsInstance.loadSource(src);
      hlsInstance.attachMedia(video);
      attachHlsErrors(hlsInstance);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => restorePlaybackRef.current());
      hlsRef.current = hlsInstance;
      return;
    }

    setError("HLS playback is not supported in this browser.");
    sourceSwitchRef.current = false;
  }, [src]);

  useEffect(() => {
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      const video = videoRef.current;
      if (video) {
        video.removeAttribute("src");
        video.load();
      }
    };
  }, []);

  // Handle speed change
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  useEffect(() => {
    const video = videoRef.current;
    const syncFullscreenFlag = () => {
      if (sourceSwitchRef.current) return;
      persistFullscreenRef.current = isVideoFullscreen(videoRef.current);
    };
    const onWebkitBegin = () => {
      persistFullscreenRef.current = true;
    };
    document.addEventListener("fullscreenchange", syncFullscreenFlag);
    video?.addEventListener("webkitendfullscreen", syncFullscreenFlag);
    video?.addEventListener("webkitbeginfullscreen", onWebkitBegin);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenFlag);
      video?.removeEventListener("webkitendfullscreen", syncFullscreenFlag);
      video?.removeEventListener("webkitbeginfullscreen", onWebkitBegin);
    };
  }, []);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    if (!hasAutoSeeked && initialTime > 0 && initialTime < (video.duration || 1000)) {
      video.currentTime = initialTime;
      setHasAutoSeeked(true);
    }

    if (onProgress && video.duration) {
      onProgress(video.currentTime, video.duration);
    }
  };

  const rememberFullscreenThen = (action?: () => void) => {
    persistFullscreenRef.current = isVideoFullscreen(videoRef.current);
    action?.();
  };

  const handleEnded = () => {
    if (autoPlayNext && onNextEpisode && hasNextEpisode) {
      rememberFullscreenThen(onNextEpisode);
    }
  };

  const retryPlayback = () => {
    setError(null);
    const video = videoRef.current;
    if (video) {
      video.load();
      video.play().catch(() => {});
    }
  };

  return (
    <div className="group/player relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-violet-950/20">
      {/* Ambient Video Glow beneath player */}
      <div className="absolute -inset-1 bg-gradient-to-r from-violet-600/20 via-indigo-600/10 to-purple-600/20 opacity-40 blur-xl pointer-events-none -z-10" />

      {/* Main Video Element */}
      <div className="relative aspect-video w-full bg-zinc-950">
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          controls
          playsInline
          autoPlay
          poster={poster ?? undefined}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onError={() => setError("Could not load video source.")}
        />

        {/* Error Overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 p-6 text-center backdrop-blur-md">
            <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
            <p className="text-sm font-semibold text-zinc-100">{error}</p>
            <p className="mt-1 text-xs text-zinc-400">
              Check your network connection or try reloading this episode.
            </p>
            <button
              type="button"
              onClick={retryPlayback}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-violet-500"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry Stream
            </button>
          </div>
        )}
      </div>

      {/* Floating Player Quick Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-zinc-950/90 px-4 py-3 backdrop-blur-md text-xs text-zinc-300">
        {/* Navigation buttons: Prev / Next */}
        <div className="flex items-center gap-2">
          {hasPrevEpisode && (
            <button
              type="button"
              onClick={() => rememberFullscreenThen(onPrevEpisode)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-medium transition-colors hover:bg-white/10 hover:text-white"
            >
              <SkipBack className="h-3.5 w-3.5" />
              <span>Prev</span>
            </button>
          )}

          {hasNextEpisode && (
            <button
              type="button"
              onClick={() => rememberFullscreenThen(onNextEpisode)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-1.5 font-semibold text-white shadow-sm transition-all hover:bg-violet-500 hover:scale-105"
            >
              <span>Next Ep</span>
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Autoplay Next Toggle */}
          {onAutoPlayToggle && (
            <button
              type="button"
              onClick={() => onAutoPlayToggle(!autoPlayNext)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors ${
                autoPlayNext
                  ? "text-violet-400 bg-violet-500/10 border border-violet-500/20"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span className="text-[11px]">Autoplay</span>
              <span
                className={`h-2 w-2 rounded-full ${
                  autoPlayNext ? "bg-violet-400 shadow-sm shadow-violet-400" : "bg-zinc-600"
                }`}
              />
            </button>
          )}
        </div>

        {/* Right side tools: Speed switcher & Theater mode */}
        <div className="flex items-center gap-2">
          {/* Speed Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-medium text-zinc-300 hover:bg-white/10 hover:text-white"
            >
              <Gauge className="h-3.5 w-3.5 text-zinc-400" />
              <span>{playbackSpeed}x</span>
            </button>

            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-2 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-2xl z-50">
                {SPEED_OPTIONS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => {
                      setPlaybackSpeed(speed);
                      setShowSpeedMenu(false);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${
                      playbackSpeed === speed
                        ? "bg-violet-600 text-white font-semibold"
                        : "text-zinc-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Theater Mode Toggle */}
          {onToggleTheater && (
            <button
              type="button"
              onClick={onToggleTheater}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-medium text-zinc-300 hover:bg-white/10 hover:text-white"
              title={isTheater ? "Exit Theater Mode" : "Theater Mode"}
            >
              {isTheater ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{isTheater ? "Compact" : "Theater"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
