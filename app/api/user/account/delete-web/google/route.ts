import { NextRequest, NextResponse } from "next/server";
import { DELETE_PAGE_COOKIE, DELETE_PAGE_COOKIE_PATH } from "@/lib/deletePageCookie";
import { GoogleTokenError, isGoogleSignInConfigured, verifyGoogleIdToken } from "@/lib/googleAuth";

/**
 * POST /api/user/account/delete-web/google
 *
 * Google sign-in in redirect mode posts here (form fields `credential` and
 * `g_csrf_token`) instead of opening a popup, which many browsers and in-app
 * browsers block. The token is checked, kept in a short-lived httpOnly cookie
 * that only the delete-web endpoint receives, and the person is sent back to
 * /delete-account.
 *
 * This URL must be listed under "Authorized redirect URIs" of the Web client.
 */
export async function POST(req: NextRequest) {
  const back = (query = "") => {
    const res = new NextResponse(null, { status: 303, headers: { Location: new URL(`/delete-account${query}`, req.url).toString() } });
    res.headers.set("Cache-Control", "no-store");
    return res;
  };
  try {
    if (!isGoogleSignInConfigured()) return back("?error=config");
    const form = await req.formData().catch(() => null);
    const credential = String(form?.get("credential") ?? "");
    const csrfBody = String(form?.get("g_csrf_token") ?? "");
    const csrfCookie = req.cookies.get("g_csrf_token")?.value;
    // Google's double-submit check. Some browsers don't send the cookie on Google's
    // cross-site POST, so it's enforced only when both values are present.
    if (csrfCookie && csrfBody && csrfCookie !== csrfBody) return back("?error=signin");
    if (!credential) return back("?error=signin");

    try {
      await verifyGoogleIdToken(credential);
    } catch (err) {
      if (err instanceof GoogleTokenError) return back("?error=signin");
      throw err;
    }

    const res = back();
    res.cookies.set({
      name: DELETE_PAGE_COOKIE,
      value: credential,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: DELETE_PAGE_COOKIE_PATH,
      // Google ID tokens last 1 hour; each request re-checks the token anyway.
      maxAge: 55 * 60,
    });
    return res;
  } catch (err) {
    console.error("Delete page sign-in failed:", err);
    return back("?error=signin");
  }
}
