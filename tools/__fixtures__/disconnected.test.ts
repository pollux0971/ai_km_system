import { describe, expect, it } from "vitest";
import { GREETING } from "./disconnected.mjs";

describe("disconnected fixture (mutate.mjs exit-2 meta-test)", () => {
  it("GREETING exists and is a string — an existence-only check, deliberately", () => {
    expect(typeof GREETING).toBe("string");
  });
});
