import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { listActivity } from "@/lib/db";

/** GET /api/admin/activity?cursor=&limit=&actorId=&entityType=&entityId= (admin only) */
export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const data = await listActivity({
    cursor: sp.get("cursor"),
    limit: Number(sp.get("limit")) || 50,
    actorId: sp.get("actorId") || undefined,
    entityType: sp.get("entityType") || undefined,
    entityId: sp.get("entityId") || undefined,
  });
  return NextResponse.json(data);
}
