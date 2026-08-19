/**
 * fix/crypto-randomuuid-insecure-context: `crypto.randomUUID` is gated to
 * secure contexts (https:// or localhost), so opening the dev server via a
 * LAN IP (http://192.168.x.x:3001) crashes every code path that mints a
 * correlationId — 30 call sites across this app. Mirror of apps/web's own
 * src/lib/crypto-random-uuid-polyfill.ts (same second-app mirroring this
 * repo uses for layout.tsx et al.); see that file's doc comment for the
 * full rationale.
 *
 * `crypto.getRandomValues` is NOT secure-context-gated, so a spec-correct
 * RFC 4122 v4 UUID can still be generated from it. Installing the fallback
 * once (from instrumentation-client.ts, which Next.js runs before any app
 * code in the browser) fixes every call site without touching them. In
 * secure contexts and in Node/edge runtimes (middleware.ts) the native
 * implementation already exists and this is a no-op.
 */

type UuidString = `${string}-${string}-${string}-${string}-${string}`;

export function uuidV4Fallback(): UuidString {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  // RFC 4122 §4.4: version nibble = 4, variant bits = 10.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function installCryptoRandomUuidPolyfill(): void {
  const cryptoObject = globalThis.crypto as Crypto | undefined;
  if (!cryptoObject || typeof cryptoObject.getRandomValues !== "function") return;
  if (typeof cryptoObject.randomUUID === "function") return;
  cryptoObject.randomUUID = uuidV4Fallback;
}
