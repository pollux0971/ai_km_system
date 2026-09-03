import { describe, expect, it } from "vitest";
import { classify } from "./slow-guard.mjs";

describe("slow-guard fixture (mutate.mjs signal-safety meta-test, E04-S083)", () => {
  it("classifies a high score as pass, after a deliberate delay", async () => {
    // The delay is the point — see slow-guard.mjs's doc comment.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(classify(0.7)).toBe("pass");
  });
});
