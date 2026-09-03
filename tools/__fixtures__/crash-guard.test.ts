import { describe, expect, it } from "vitest";
import { classify } from "./crash-guard.mjs";

describe("crash-guard fixture (mutate.mjs in-flight marker meta-test, E04-S083)", () => {
  it("classifies a high score as pass, after a deliberate delay", async () => {
    // The delay is the point — see crash-guard.mjs's doc comment.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(classify(0.7)).toBe("pass");
  });
});
