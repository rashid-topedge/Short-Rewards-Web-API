import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { listUsersAdmin, updateUserCoinsAdmin, deleteUserAdmin } from "@/lib/db";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") || "";
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const data = await listUsersAdmin({ query, limit, offset });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const coins = Number(body?.coins);
    const streakDay = body?.streakDay !== undefined ? Number(body.streakDay) : undefined;
    const description = typeof body?.description === "string" ? body.description.trim() : "Admin Adjustment";

    if (!userId || isNaN(coins)) {
      return NextResponse.json({ error: "userId and valid coins amount are required" }, { status: 400 });
    }

    const updated = updateUserCoinsAdmin(userId, coins, streakDay, description);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  deleteUserAdmin(userId);
  return NextResponse.json({ success: true, message: "User deleted successfully" });
}