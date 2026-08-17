import { describe, expect, it } from "vitest";
import { listFeedback } from "./feedback";

describe("listFeedback (E11-S016)", () => {
  it("returns an empty list — no real feedback submission mechanism exists yet (E13, Team A's own not-yet-reached epic)", async () => {
    const result = await listFeedback();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });
});
