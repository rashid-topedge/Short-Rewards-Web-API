import { NextRequest, NextResponse } from "next/server";
import { authenticateStaff, loginBlockedFor, setAdminCookie } from "@/lib/auth";
import { logActivity } from "@/lib/db";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "";
}

/**
 * POST /api/admin/login  { username, password }
 * Signs in the admin (.env) or a moderator. Returns `redirectTo`: moderators
 * land on Reels, the only section they can use.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    const ip = clientIp(req);
    const wait = loginBlockedFor(username, ip);
    if (wait > 0) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` },
        { status: 429, headers: { "Retry-After": String(wait) } }
      );
    }

    const result = await authenticateStaff(username, password, ip);
    if (!result.ok && result.reason === "no_admin") {
      // No admin account in the database yet: say so plainly instead of a
      // confusing "wrong password". Moderators can still sign in.
      return NextResponse.json(
        {
          error:
            "No admin account has been set up yet. Set ADMIN_USERNAME and ADMIN_PASSWORD once in the server environment and restart: they're saved to the database on the first sign-in, and you can remove them afterwards.",
          code: "ADMIN_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.reason === "disabled"
              ? "This account has been disabled. Ask the admin to re-enable it."
              : "Invalid username or password",
        },
        { status: result.reason === "disabled" ? 403 : 401 }
      );
    }

    const { session } = result;
    if (session.role === "moderator") {
      await logActivity(
        { actorId: session.actorId, displayName: session.displayName, role: session.role },
        { action: "staff.login", entityType: "staff", entityId: session.moderatorId, summary: "Signed in" }
      ).catch(() => {});
    }

    const response = NextResponse.json({
      success: true,
      message: "Logged in successfully",
      role: session.role,
      redirectTo: session.role === "moderator" ? "/admin/reels" : "/admin",
    });
    setAdminCookie(response, result.token);
    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
