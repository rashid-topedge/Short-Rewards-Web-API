import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, readStaffToken } from "@/lib/adminToken";
import { getSessionSecret } from "@/lib/adminSecret";

/**
 * Admin console page routing (pages only; every API checks the session itself).
 * - No valid session → /admin/login
 * - Moderators → only /admin/reels; anything else sends them there.
 *
 * This checks the token signature (secret from the database, cached). Disabled
 * moderators and changed passwords are caught by the console layout and the
 * APIs, which also check the account.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return NextResponse.next();
  }

  let session = null;
  try {
    session = readStaffToken(request.cookies.get(COOKIE_NAME)?.value, await getSessionSecret());
  } catch (err) {
    console.error("Admin proxy: couldn't load the session secret", err);
  }
  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  if (session.role === "moderator" && !(pathname === "/admin/reels" || pathname.startsWith("/admin/reels/"))) {
    return NextResponse.redirect(new URL("/admin/reels", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
