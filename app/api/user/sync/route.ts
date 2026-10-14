import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = typeof body?.userId === "string" ? body.userId.trim() : null;
    const clientDate = typeof body?.clientDate === "string" ? body.clientDate.trim() : undefined;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const user = await getOrCreateUser(userId, clientDate);
    return NextResponse.json(user);
  } catch (err: unknown) {
    console.error("Failed to sync user profile:", err);
    return NextResponse.json(
      { error: "Internal server error syncing user" },
      { status: 500 }
    );
  }
}
