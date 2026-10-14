import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { getAdminDashboardStats } from "@/lib/db";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const stats = await getAdminDashboardStats();
  return NextResponse.json(stats);
}