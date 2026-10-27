import crypto, { type KeyObject } from "node:crypto";

/**
 * Verifies Google ID tokens ("Sign in with Google" on Android).
 *
 * The token is an RS256-signed JWT. We check it against Google's published
 * public keys (cached per their Cache-Control header), then check issuer,
 * audience (your OAuth client ID) and expiry. No Google SDK needed, and no
 * network call per request once the keys are cached.
 *
 * GOOGLE_OAUTH_CLIENT_IDS: comma-separated list of accepted client IDs.
 * With Android Credential Manager, the ID token's audience is the *Web*
 * client ID you pass as `serverClientId`, so that is the one to list here.
 */

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const CLOCK_SKEW_SECONDS = 60;

export type GoogleIdentity = {
  sub: string; // stable Google account ID
  email: string | null;
  emailVerified: boolean;
  name: string | null;
};

export class GoogleTokenError extends Error {}

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string };
let jwksCache: { keys: Map<string, KeyObject>; expiresAt: number } | null = null;

/** For tests: supply keys instead of fetching Google's. */
let jwksOverride: Jwk[] | null = null;
export function __setGoogleJwksForTests(keys: Jwk[] | null): void {
  jwksOverride = keys;
  jwksCache = null;
}

async function getGoogleKeys(forceRefresh = false): Promise<Map<string, KeyObject>> {
  if (!forceRefresh && jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys;

  let jwks: Jwk[];
  let maxAgeMs = 60 * 60 * 1000;
  if (jwksOverride) {
    jwks = jwksOverride;
  } else {
    const res = await fetch(GOOGLE_JWKS_URL);
    if (!res.ok) throw new GoogleTokenError(`Could not fetch Google keys (HTTP ${res.status})`);
    const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") || "");
    if (maxAge) maxAgeMs = Number(maxAge[1]) * 1000;
    jwks = ((await res.json()) as { keys: Jwk[] }).keys;
  }

  const keys = new Map<string, KeyObject>();
  for (const jwk of jwks) {
    if (jwk.kty === "RSA" && jwk.kid) {
      keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: "jwk" }));
    }
  }
  jwksCache = { keys, expiresAt: Date.now() + maxAgeMs };
  return keys;
}

function allowedClientIds(): string[] {
  return (process.env.GOOGLE_OAUTH_CLIENT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isGoogleSignInConfigured(): boolean {
  return allowedClientIds().length > 0;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const clientIds = allowedClientIds();
  if (clientIds.length === 0) {
    throw new GoogleTokenError("Google sign-in is not configured (GOOGLE_OAUTH_CLIENT_IDS is empty)");
  }

  const parts = idToken.split(".");
  if (parts.length !== 3) throw new GoogleTokenError("Malformed Google ID token");
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    throw new GoogleTokenError("Malformed Google ID token");
  }
  if (header.alg !== "RS256" || !header.kid) throw new GoogleTokenError("Unexpected token algorithm");

  let keys = await getGoogleKeys();
  if (!keys.has(header.kid)) keys = await getGoogleKeys(true); // Google rotated its keys
  const key = keys.get(header.kid);
  if (!key) throw new GoogleTokenError("Unknown signing key");

  const valid = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    key,
    Buffer.from(signatureB64, "base64url")
  );
  if (!valid) throw new GoogleTokenError("Invalid token signature");

  const now = Math.floor(Date.now() / 1000);
  if (!GOOGLE_ISSUERS.has(String(payload.iss))) throw new GoogleTokenError("Wrong token issuer");
  const aud = payload.aud;
  const audiences = Array.isArray(aud) ? aud.map(String) : [String(aud)];
  if (!audiences.some((a) => clientIds.includes(a))) throw new GoogleTokenError("Token was not issued for this app");
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SECONDS < now) {
    throw new GoogleTokenError("Google token has expired");
  }
  if (typeof payload.iat === "number" && payload.iat - CLOCK_SKEW_SECONDS > now) {
    throw new GoogleTokenError("Google token issued in the future");
  }
  if (typeof payload.sub !== "string" || !payload.sub) throw new GoogleTokenError("Token has no subject");

  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    name: typeof payload.name === "string" ? payload.name : null,
  };
}
