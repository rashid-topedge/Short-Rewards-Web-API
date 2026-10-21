import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { testB2Connection } from "@/lib/b2";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { keyId, applicationKey, bucketId } = body;

    if (!keyId || !applicationKey || !bucketId) {
      return NextResponse.json(
        { success: false, message: "Please provide Key ID, Application Key, and Bucket ID to test." },
        { status: 400 }
      );
    }

    const result = await testB2Connection({
      keyId: String(keyId).trim(),
      applicationKey: String(applicationKey).trim(),
      bucketId: String(bucketId).trim(),
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Test B2 connection error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
