import { NextRequest, NextResponse } from "next/server";
import { checkAdminCredentials, generateSessionToken, setAdminCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password.trim() : "";

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    if (!checkAdminCredentials(username, password)) {
      return NextResponse.json({ error: "Invalid admin username or password" }, { status: 401 });
    }

    const token = generateSessionToken();
    const response = NextResponse.json({ success: true, message: "Logged in successfully" });
    setAdminCookie(response, token);
    return response;
  } catch (err: unknown) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
