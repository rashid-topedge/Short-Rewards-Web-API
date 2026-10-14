import { NextRequest, NextResponse } from "next/server";
import { checkInUser } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = typeof body?.userId === "string" ? body.userId.trim() : null;
    const clientDate = typeof body?.clientDate === "string" ? body.clientDate.trim() : undefined;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const result = checkInUser(userId, clientDate);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Failed to check in user:", err);
    return NextResponse.json(
      { error: "Internal server error performing check-in" },
      { status: 500 }
    );
  }
}
