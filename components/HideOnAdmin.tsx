"use client";

import { usePathname } from "next/navigation";

/** Renders its children on the public site only; the admin console (/admin/...) has its own layout. */
export function HideOnAdmin({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname?.startsWith("/admin/")) return null;
  return <>{children}</>;
}
