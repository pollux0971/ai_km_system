import { describe, expect, it } from "vitest";
import { classify } from "./good-guard.mjs";

describe("good-guard fixture (mutate.mjs exit-0 meta-test)", () => {
  it("classifies a high score as pass", () => {
    expect(classify(0.7)).toBe("pass");
  });
});
