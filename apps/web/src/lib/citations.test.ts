import { describe, expect, it } from "vitest";
import { getCitationSource } from "./citations";

describe("getCitationSource (E03-S014)", () => {
  it("resolves a known citation id to its mock source", async () => {
    const result = await getCitationSource("1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("1");
    expect(result.value.file.length).toBeGreaterThan(0);
    expect(result.value.snippet.length).toBeGreaterThan(0);
    expect(typeof result.value.page).toBe("number");
  });

  it("resolves a different known citation id to genuinely different content", async () => {
    const first = await getCitationSource("1");
    const second = await getCitationSource("2");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.file).not.toBe(first.value.file);
    expect(second.value.page).not.toBe(first.value.page);
  });

  it("fails closed with NOT_FOUND for an unknown citation id", async () => {
    const result = await getCitationSource("does-not-exist");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});
