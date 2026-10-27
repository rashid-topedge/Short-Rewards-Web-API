import crypto, { type KeyObject } from "node:crypto";

/**
 * Verifies Firebase Authentication ID tokens (the Android app's guest and
 * Google sign-in).
 *
 * Same approach as googleAuth.ts: the token is an RS256-signed JWT, checked
 * against Firebase's published public keys (cached per Cache-Control), then
 * issuer, audience (your Firebase project id), expiry and auth_time. No
 * firebase-admin SDK or service-account key needed.
 *
 * FIREBASE_PROJECT_ID: the Firebase project the app's google-services.json
 * belongs to.
 */

const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const CLOCK_SKEW_SECONDS = 60;

/** Matches app/google-services.json. Override with FIREBASE_PROJECT_ID. */
const DEFAULT_FIREBASE_PROJECT_ID = "short-rewards-app";

export type FirebaseIdentity = {
  uid: string;
  /** "anonymous", "google.com", … */
  provider: string | null;
  /** The Google account id (same as a Google ID token's `sub`), if Google is linked. */
  googleSub: string | null;
  email: string | null;
  emailVerified: boolean;
};

export class FirebaseTokenError extends Error {}

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string };
let jwksCache: { keys: Map<string, KeyObject>; expiresAt: number } | null = null;

async function getFirebaseKeys(forceRefresh = false): Promise<Map<string, KeyObject>> {
  if (!forceRefresh && jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys;

  const res = await fetch(FIREBASE_JWKS_URL);
  if (!res.ok) throw new FirebaseTokenError(`Could not fetch Firebase keys (HTTP ${res.status})`);
  let maxAgeMs = 60 * 60 * 1000;
  const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") || "");
  if (maxAge) maxAgeMs = Number(maxAge[1]) * 1000;
  const jwks = ((await res.json()) as { keys: Jwk[] }).keys;

  const keys = new Map<string, KeyObject>();
  for (const jwk of jwks) {
    if (jwk.kty === "RSA" && jwk.kid) {
      keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: "jwk" }));
    }
  }
  jwksCache = { keys, expiresAt: Date.now() + maxAgeMs };
  return keys;
}

export function firebaseProjectId(): string {
  return (process.env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID).trim();
}

export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseIdentity> {
  const projectId = firebaseProjectId();

  const parts = idToken.split(".");
  if (parts.length !== 3) throw new FirebaseTokenError("Malformed Firebase ID token");
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    throw new FirebaseTokenError("Malformed Firebase ID token");
  }
  if (header.alg !== "RS256" || !header.kid) throw new FirebaseTokenError("Unexpected token algorithm");

  let keys = await getFirebaseKeys();
  if (!keys.has(header.kid)) keys = await getFirebaseKeys(true); // keys rotated
  const key = keys.get(header.kid);
  if (!key) throw new FirebaseTokenError("Unknown signing key");

  const valid = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    key,
    Buffer.from(signatureB64, "base64url")
  );
  if (!valid) throw new FirebaseTokenError("Invalid token signature");

  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new FirebaseTokenError("Token was not issued for this Firebase project");
  }
  if (payload.aud !== projectId) throw new FirebaseTokenError("Token was not issued for this Firebase project");
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SECONDS < now) {
    throw new FirebaseTokenError("Firebase token has expired");
  }
  if (typeof payload.iat === "number" && payload.iat - CLOCK_SKEW_SECONDS > now) {
    throw new FirebaseTokenError("Firebase token issued in the future");
  }
  if (typeof payload.auth_time === "number" && payload.auth_time - CLOCK_SKEW_SECONDS > now) {
    throw new FirebaseTokenError("Firebase token has an invalid auth time");
  }
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) {
    throw new FirebaseTokenError("Token has no subject");
  }

  const firebase = (payload.firebase ?? {}) as {
    sign_in_provider?: unknown;
    identities?: Record<string, unknown>;
  };
  const googleIds = firebase.identities?.["google.com"];
  const googleSub = Array.isArray(googleIds) && typeof googleIds[0] === "string" ? googleIds[0] : null;
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";

  return {
    uid: payload.sub,
    provider: typeof firebase.sign_in_provider === "string" ? firebase.sign_in_provider : null,
    googleSub,
    email: typeof payload.email === "string" ? payload.email : null,
    emailVerified,
  };
}
