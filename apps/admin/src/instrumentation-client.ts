/**
 * Next.js client instrumentation (runs in the browser before any app
 * code). Sole job: make `crypto.randomUUID` available in non-secure
 * contexts (plain-http LAN access) — see crypto-random-uuid-polyfill.ts.
 */
import { installCryptoRandomUuidPolyfill } from "@/lib/crypto-random-uuid-polyfill";

installCryptoRandomUuidPolyfill();
