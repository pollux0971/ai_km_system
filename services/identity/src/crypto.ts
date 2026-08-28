/**
 * Password hashing and session-token hashing (E02-S032, ADR 0005 §2).
 *
 * scrypt cost is N=2^14, r=8, p=1 — memory ≈ 128·N·r ≈ 16 MiB, deliberately
 * kept under Node's default 32 MiB `scrypt` `maxmem` so no caller has to know
 * to raise it.
 *
 * `verifyPassword` always runs a real scrypt computation, even for a username
 * that does not exist (`DUMMY_SALT`/`DUMMY_HASH` below) — the login route
 * uses the dummy pair specifically so an unknown-username request costs the
 * same wall-clock time as a wrong-password one, which is the constant-time
 * requirement in AC2.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 2 ** 14;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const PASSWORD_SALT_BYTES = 32;
const SESSION_TOKEN_BYTES = 32;

export interface PasswordHash {
  readonly hash: string;
  readonly salt: string;
}

// better-sqlite3 (this whole app's storage layer) is synchronous by design —
// see apps/api/src/db/index.ts's docstring — so a synchronous scrypt does not
// introduce a new kind of blocking the request path didn't already have.
// Callers still see a Promise-returning API: that keeps the option open to
// move to the async `node:crypto` scrypt later without another signature
// change, and TypeScript's typings for the async variant do not compose
// cleanly with `util.promisify` across its overloads.
function scryptHex(password: string, saltHex: string, keylen: number): string {
  const salt = Buffer.from(saltHex, "hex");
  return scryptSync(password, salt, keylen, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }).toString("hex");
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const hash = scryptHex(password, salt, SCRYPT_KEYLEN);
  return { hash, salt };
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function verifyPassword(
  password: string,
  saltHex: string,
  expectedHashHex: string,
): Promise<boolean> {
  const expected = Buffer.from(expectedHashHex, "hex");
  const actual = Buffer.from(scryptHex(password, saltHex, expected.length), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * A fixed salt/hash pair `verifyPassword` can be compared against when the
 * username was not found, so the failure path always pays for one real
 * scrypt computation. The password behind it is not a secret — nothing it
 * protects exists — its only job is to make the dummy hash reproducible
 * without doing an async scrypt call at module load time.
 */
export const DUMMY_SALT = "0".repeat(PASSWORD_SALT_BYTES * 2);
let dummyHashCached: string | undefined;
// eslint-disable-next-line @typescript-eslint/require-await
export async function dummyHash(): Promise<string> {
  dummyHashCached ??= scryptHex("ai-km-constant-time-placeholder", DUMMY_SALT, SCRYPT_KEYLEN);
  return dummyHashCached;
}

export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** The DB stores only this — never the token itself (ADR 0005 §2). */
export function hashSessionToken(token: string): string {
  return sha256Hex(token);
}

/** For telemetry only (E02-S034): a username must never appear in a log line unhashed. */
export function hashUsernameForTelemetry(username: string): string {
  return sha256Hex(username);
}
