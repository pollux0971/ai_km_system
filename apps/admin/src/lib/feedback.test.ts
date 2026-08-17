import { describe, expect, it } from "vitest";
import { getFeedback, listFeedback } from "./feedback";

describe("listFeedback (E11-S016)", () => {
  it("returns an empty list — no real feedback submission mechanism exists yet (E13, Team A's own not-yet-reached epic)", async () => {
    const result = await listFeedback();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });
});

describe("getFeedback (E11-S017)", () => {
  it("returns null for any id — the same permanently-empty reality listFeedback() already reflects, since no feedback item has ever been submitted", async () => {
    const result = await getFeedback("any-feedback-id-at-all");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });

  it("returns null for a second, different id too — not a fixed single lookup result", async () => {
    const result = await getFeedback("a-completely-different-id");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });
});
