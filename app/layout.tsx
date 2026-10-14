import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DramaFlix - Stream Trending Short Dramas & Plays",
  description: "Browse curated trending short dramas, high-definition play episodes, and popular web series.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-[#09090b] text-zinc-100 selection:bg-violet-500 selection:text-white relative">
        {/* Ambient background glows */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-40">
          <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-violet-600/20 via-indigo-600/10 to-transparent blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute top-[40%] right-[-10%] w-[500px] h-[500px] bg-amber-500/5 blur-[100px] rounded-full pointer-events-none" />
        </div>

        <Navbar />

        <main className="relative z-10 flex-1 flex flex-col">{children}</main>

        <footer className="relative z-10 border-t border-white/[0.06] bg-zinc-950/60 py-8 backdrop-blur-md mt-auto">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8 text-xs text-zinc-500">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-300">DramaFlix</span>
              <span>•</span>
              <span>Ultra-fast streaming & short plays</span>
            </div>
            <p>© {new Date().getFullYear()} DramaFlix. All rights reserved.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
