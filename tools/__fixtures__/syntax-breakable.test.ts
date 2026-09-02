import { describe, expect, it } from "vitest";
import { addOne } from "./syntax-breakable.mjs";

describe("syntax-breakable fixture (mutate.mjs exit-4 meta-test)", () => {
  it("adds one", () => {
    expect(addOne(2)).toBe(3);
  });
});
