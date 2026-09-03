import { describe, expect, it } from "vitest";
import { classify } from "./ledger-check.mjs";

describe("ledger-check fixture (mutate.mjs pre-flight self-check meta-test, E04-S083)", () => {
  it("classifies a high score as pass", () => {
    expect(classify(0.7)).toBe("pass");
  });
});
