import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { listRedemptionsAdmin } from "@/lib/db";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";
  const userId = searchParams.get("userId") || undefined;
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const data = await listRedemptionsAdmin({
    status,
    userId,
    limit,
    offset,
  });

  return NextResponse.json(data);
}
