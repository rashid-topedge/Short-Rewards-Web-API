"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Film, Sparkles, Bookmark, Compass } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.07] bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Link
          href="/"
          className="group flex items-center gap-2.5 transition-opacity hover:opacity-90"
        >
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-800 p-0.5 shadow-lg shadow-violet-500/20">
            <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-zinc-950/40">
              <Film className="h-5 w-5 text-violet-200 transition-transform duration-300 group-hover:scale-110" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-violet-500"></span>
            </span>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-lg font-bold tracking-tight text-transparent">
                DramaFlix
              </span>
              <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-violet-300 uppercase border border-violet-500/30">
                HD
              </span>
            </div>
            <span className="text-[11px] font-medium text-zinc-400 -mt-0.5">
              Short Play & Drama Stream
            </span>
          </div>
        </Link>

        {/* Navigation Items */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/"
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition-all ${
              pathname === "/"
                ? "bg-violet-600/15 text-violet-300 border border-violet-500/25"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            <Compass className="h-4 w-4" />
            <span>Discover</span>
          </Link>

          <Link
            href="/?q=trending"
            className="hidden sm:flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium text-zinc-400 transition-all hover:bg-white/5 hover:text-zinc-200"
          >
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span>Trending</span>
          </Link>
        </nav>
      </div>

      {/* Ambient glowing sub-border line */}
      <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-violet-500/30 to-transparent"></div>
    </header>
  );
}
