import { NextRequest, NextResponse } from "next/server";
import { isValidClaimId } from "@/lib/db";

/**
 * Reads the claim ID for a reward/check-in request: the `Idempotency-Key`
 * header, or `claimId` in the JSON body. A malformed value is rejected with 400.
 */
export function readClaimId(
  req: NextRequest,
  body: unknown
): { ok: true; claimId?: string } | { ok: false; response: NextResponse } {
  const header = req.headers.get("idempotency-key")?.trim();
  const fromBody = (body as { claimId?: unknown } | null)?.claimId;
  const value = header || (typeof fromBody === "string" ? fromBody.trim() : undefined);
  if (value === undefined || value === "") return { ok: true };
  if (!isValidClaimId(value)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "claimId / Idempotency-Key must be 8–128 characters: letters, digits, _ . : -", code: "INVALID_CLAIM_ID" },
        { status: 400 }
      ),
    };
  }
  return { ok: true, claimId: value };
}

/** Maps a claim result to its HTTP status, so every claim endpoint answers the same way. */
export function claimResponse(result: {
  code?: string;
  retryAfterSeconds?: number;
}): NextResponse {
  switch (result.code) {
    case "ALREADY_CLAIMED":
      return NextResponse.json(result, { status: 409 });
    case "DAILY_LIMIT":
    case "COOLDOWN": {
      const headers: Record<string, string> = {};
      if (result.retryAfterSeconds) headers["Retry-After"] = String(result.retryAfterSeconds);
      return NextResponse.json(result, { status: 429, headers });
    }
    case "CLAIM_ID_REUSED":
      return NextResponse.json(result, { status: 422 });
    case "REEL_NOT_FOUND":
      return NextResponse.json(result, { status: 404 });
    case "TOO_EARLY": {
      const headers: Record<string, string> = {};
      if (result.retryAfterSeconds) headers["Retry-After"] = String(result.retryAfterSeconds);
      return NextResponse.json(result, { status: 425, headers });
    }
    case "INVALID_WATCH_TOKEN":
    case "WATCH_TOKEN_REQUIRED":
      return NextResponse.json(result, { status: 400 });
    default:
      return NextResponse.json(result);
  }
}
