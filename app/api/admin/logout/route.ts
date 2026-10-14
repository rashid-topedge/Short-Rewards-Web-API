import { NextResponse } from "next/server";
import { clearAdminCookie } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ success: true, message: "Logged out successfully" });
  clearAdminCookie(response);
  return response;
}
