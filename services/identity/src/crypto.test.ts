import { describe, expect, it } from "vitest";
import {
  DUMMY_SALT,
  dummyHash,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "./crypto.js";

describe("hashPassword / verifyPassword", () => {
  it("verifies the correct password against its own hash", async () => {
    const { hash, salt } = await hashPassword("demo-pass-123");
    expect(await verifyPassword("demo-pass-123", salt, hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const { hash, salt } = await hashPassword("demo-pass-123");
    expect(await verifyPassword("wrong-password", salt, hash)).toBe(false);
  });

  it("never stores the plaintext password in the hash or salt", async () => {
    const { hash, salt } = await hashPassword("demo-pass-123");
    expect(hash).not.toContain("demo-pass-123");
    expect(salt).not.toContain("demo-pass-123");
  });

  it("gives two hashes of the same password different salts (and so different hashes)", async () => {
    const a = await hashPassword("demo-pass-123");
    const b = await hashPassword("demo-pass-123");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("stays under Node's default 32 MiB scrypt maxmem (no maxmem override needed)", async () => {
    await expect(hashPassword("demo-pass-123")).resolves.toBeDefined();
  });
});

describe("dummyHash (AC2 constant-time path)", () => {
  it("is deterministic and verifiable against DUMMY_SALT", async () => {
    const hash = await dummyHash();
    expect(await verifyPassword("ai-km-constant-time-placeholder", DUMMY_SALT, hash)).toBe(true);
  });

  it("never verifies against a real user's password", async () => {
    const hash = await dummyHash();
    expect(await verifyPassword("demo-pass-123", DUMMY_SALT, hash)).toBe(false);
  });
});

describe("generateSessionToken", () => {
  it("returns a URL-safe token with no padding characters", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns a different token every call", () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });
});

describe("hashSessionToken", () => {
  it("is deterministic", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("never contains the original token", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).not.toContain(token);
  });

  it("gives different tokens different hashes", () => {
    expect(hashSessionToken(generateSessionToken())).not.toBe(hashSessionToken(generateSessionToken()));
  });
});
