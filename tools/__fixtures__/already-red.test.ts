import { describe, expect, it } from "vitest";
import { VALUE } from "./already-red.mjs";

describe("already-red fixture (mutate.mjs exit-1 meta-test: not a valid baseline)", () => {
  it("is deliberately false, always", () => {
    expect(VALUE).toBe(999);
  });
});
