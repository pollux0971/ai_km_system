import { describe, expect, it } from "vitest";
import { AI_KM_SEED_NAMESPACE, uuidV5 } from "./uuid-v5.js";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("uuidV5 (E04-S041 — deterministic seed ids)", () => {
  it("is a syntactically valid version-5 UUID", () => {
    expect(uuidV5(AI_KM_SEED_NAMESPACE, "owner-1:sample-1")).toMatch(UUID_SHAPE);
  });

  it("is deterministic — same namespace + name always derives the same id", () => {
    const a = uuidV5(AI_KM_SEED_NAMESPACE, "owner-1:sample-1");
    const b = uuidV5(AI_KM_SEED_NAMESPACE, "owner-1:sample-1");
    expect(a).toBe(b);
  });

  it("gives different owners different ids for the same sample slot", () => {
    const a = uuidV5(AI_KM_SEED_NAMESPACE, "owner-1:sample-1");
    const b = uuidV5(AI_KM_SEED_NAMESPACE, "owner-2:sample-1");
    expect(a).not.toBe(b);
  });

  it("gives the same owner different ids for different sample slots", () => {
    const a = uuidV5(AI_KM_SEED_NAMESPACE, "owner-1:sample-1");
    const b = uuidV5(AI_KM_SEED_NAMESPACE, "owner-1:sample-2");
    expect(a).not.toBe(b);
  });

  it("rejects a malformed namespace rather than silently hashing garbage", () => {
    expect(() => uuidV5("not-a-uuid", "x")).toThrow();
  });
});
