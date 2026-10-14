import { NextRequest, NextResponse } from "next/server";
import { listReels } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cursorParam = searchParams.get("cursor");
  const cursor = cursorParam ? parseInt(cursorParam, 10) : undefined;
  const limit = parseInt(searchParams.get("limit") || "10", 10);
  const dramaIdParam = searchParams.get("dramaId");
  const dramaId = dramaIdParam ? parseInt(dramaIdParam, 10) : undefined;
  const sort = (searchParams.get("sort") || "newest") as "newest" | "trending" | "random";

  const data = await listReels({
    cursor: isNaN(cursor as number) ? undefined : cursor,
    limit,
    dramaId: isNaN(dramaId as number) ? undefined : dramaId,
    sort,
  });

  return NextResponse.json(data);
}
