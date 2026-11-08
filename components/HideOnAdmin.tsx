"use client";

import { usePathname } from "next/navigation";

/** Pages shown without the public site's header and footer (standalone pages linked from Google Play). */
const BARE_PAGES = ["/privacy", "/delete-account"];

/**
 * Renders its children on the public site only. Hidden in the admin console
 * (/admin/..., which has its own layout) and on BARE_PAGES.
 */
export function HideOnAdmin({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname?.startsWith("/admin/")) return null;
  if (pathname && BARE_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;
  return <>{children}</>;
}
