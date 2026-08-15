import { describe, expect, it } from "vitest";
import { listMaintenanceCases } from "./maintenance-cases";

describe("listMaintenanceCases (E07-S001)", () => {
  it("resolves with a non-empty list of maintenance case summaries", async () => {
    const result = await listMaintenanceCases();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      for (const item of result.value) {
        expect(item.id).toBeTruthy();
        expect(item.title).toBeTruthy();
        expect(item.updatedAt).toBeTruthy();
      }
    }
  });

  it("returns the same items on repeated calls (stable across the session)", async () => {
    const first = await listMaintenanceCases();
    const second = await listMaintenanceCases();

    expect(first).toEqual(second);
  });

  it("orders items most-recently-updated first", async () => {
    const result = await listMaintenanceCases();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const timestamps = result.value.map((item) => item.updatedAt);
    const sorted = [...timestamps].sort((a, b) => b.localeCompare(a));
    expect(timestamps).toEqual(sorted);
  });
});
