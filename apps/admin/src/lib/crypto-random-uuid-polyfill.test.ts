import { afterEach, describe, expect, it } from "vitest";
import { installCryptoRandomUuidPolyfill, uuidV4Fallback } from "./crypto-random-uuid-polyfill";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const nativeRandomUUID = globalThis.crypto.randomUUID;

afterEach(() => {
  // Restore whatever the test replaced so no other test file ever sees a
  // patched global.
  globalThis.crypto.randomUUID = nativeRandomUUID;
});

describe("uuidV4Fallback", () => {
  it("produces spec-correct RFC 4122 v4 UUIDs (version nibble 4, variant 10)", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(uuidV4Fallback()).toMatch(UUID_V4_PATTERN);
    }
  });

  it("produces distinct values across calls", () => {
    const values = new Set(Array.from({ length: 100 }, () => uuidV4Fallback()));
    expect(values.size).toBe(100);
  });
});

describe("installCryptoRandomUuidPolyfill", () => {
  it("leaves a native crypto.randomUUID untouched (secure contexts win)", () => {
    installCryptoRandomUuidPolyfill();

    expect(globalThis.crypto.randomUUID).toBe(nativeRandomUUID);
  });

  it("installs the fallback when crypto.randomUUID is missing (insecure context)", () => {
    // Simulate a non-secure browsing context: getRandomValues exists,
    // randomUUID does not.
    (globalThis.crypto as { randomUUID?: Crypto["randomUUID"] }).randomUUID = undefined;

    installCryptoRandomUuidPolyfill();

    expect(typeof globalThis.crypto.randomUUID).toBe("function");
    expect(globalThis.crypto.randomUUID()).toMatch(UUID_V4_PATTERN);
  });
});
