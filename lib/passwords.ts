import crypto from "node:crypto";

/**
 * Password hashing for moderator accounts (scrypt, per-password random salt).
 * Stored as "scrypt$<N>$<saltB64>$<hashB64>".
 */

const N = 16384;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LEN, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const salt = Buffer.from(parts[2], "base64");
  const expected = Buffer.from(parts[3], "base64");
  if (!Number.isFinite(n) || expected.length !== KEY_LEN) return false;
  const actual = crypto.scryptSync(password, salt, KEY_LEN, { N: n, r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}

/** Minimum rules for moderator passwords. Returns an error message or null. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Use both letters and numbers.";
  return null;
}
