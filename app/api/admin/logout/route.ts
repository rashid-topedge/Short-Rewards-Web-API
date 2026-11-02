import { NextRequest, NextResponse } from "next/server";
import { clearAdminCookie } from "@/lib/auth";

/**
 * POST /api/admin/logout: signs the staff member out (clears the session cookie).
 * - From the console's "Sign Out" button (a normal form post): redirects back
 *   to the admin console, which shows the sign-in page.
 * - From code (fetch / API clients asking for JSON): returns { success: true }.
 */
export async function POST(req: NextRequest) {
  const accept = req.headers.get("accept") || "";
  const contentType = req.headers.get("content-type") || "";
  const fromForm =
    accept.includes("text/html") ||
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");

  const response = fromForm
    ? // 303 so the browser follows with a GET (not a repeated POST).
      new NextResponse(null, { status: 303, headers: { Location: new URL("/admin/login", req.url).toString() } })
    : NextResponse.json({ success: true, message: "Logged out successfully" });
  clearAdminCookie(response);
  return response;
}
