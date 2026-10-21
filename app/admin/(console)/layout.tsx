import React from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateSessionToken } from "@/lib/auth";
import {
  LayoutDashboard,
  Tv2,
  Video,
  Users,
  Coins,
  CreditCard,
  LogOut,
  ExternalLink,
  ShieldCheck,
  Flame,
  CloudCog,
} from "lucide-react";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("dramflix_admin_session")?.value;

  if (!validateSessionToken(token)) {
    redirect("/admin/login");
  }

  const navItems = [
    { label: "Overview", href: "/admin", icon: LayoutDashboard },
    { label: "Dramas & Series", href: "/admin/dramas", icon: Tv2 },
    { label: "Reels & Shorts", href: "/admin/reels", icon: Video },
    { label: "Payouts & Redemptions", href: "/admin/payouts", icon: CreditCard },
    { label: "Users & Economy", href: "/admin/users", icon: Users },
    { label: "Transactions", href: "/admin/transactions", icon: Coins },
    { label: "Storage & B2 Keys", href: "/admin/settings", icon: CloudCog },
  ];

  return (
    <div className="flex min-h-screen bg-[#090b10] text-[#e8ecf4] font-sans antialiased">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[#1a202c] bg-[#0d1117] flex flex-col justify-between shrink-0 sticky top-0 h-screen">
        <div>
          {/* Brand Header */}
          <div className="h-16 flex items-center px-6 border-b border-[#1a202c] gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 via-pink-600 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-600/25">
              <Flame className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-wider bg-gradient-to-r from-white via-neutral-200 to-rose-400 bg-clip-text text-transparent">
                DRAMFLIX
              </span>
              <span className="block text-[10px] uppercase font-bold tracking-widest text-rose-500">
                Command Console
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5">
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-[#64748b]">
              Management
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-[#94a3b8] hover:text-white hover:bg-[#161c28] transition-all group"
                >
                  <Icon className="w-4 h-4 text-[#64748b] group-hover:text-rose-400 transition-colors" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User / Logout Footer */}
        <div className="p-4 border-t border-[#1a202c] space-y-2">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[#161c28]/60 border border-[#1f293d]">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">Admin Root</p>
              <p className="text-[10px] text-emerald-400 font-mono">Authenticated</p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Link
              href="/"
              target="_blank"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium text-[#94a3b8] hover:text-white hover:bg-[#161c28] transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Public App
            </Link>

            <form action="/api/admin/logout" method="POST" className="flex-1">
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto min-w-0 p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {children}
        </div>
      </main>
    </div>
  );
}
