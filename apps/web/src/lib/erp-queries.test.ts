import { describe, expect, it } from "vitest";
import { listErpQueries } from "./erp-queries";

describe("listErpQueries (E09-S001)", () => {
  it("resolves with a non-empty list of ERP query summaries", async () => {
    const result = await listErpQueries();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
    for (const item of result.value) {
      expect(item.id).toBeTruthy();
      expect(item.questionText).toBeTruthy();
      expect(item.createdAt).toBeTruthy();
    }
  });

  it("returns the same items on repeated calls (stable across the session)", async () => {
    const first = await listErpQueries();
    const second = await listErpQueries();

    expect(first).toEqual(second);
  });

  it("orders items most-recently-created first", async () => {
    const result = await listErpQueries();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const timestamps = result.value.map((item) => item.createdAt);
    const sorted = [...timestamps].sort((a, b) => b.localeCompare(a));
    expect(timestamps).toEqual(sorted);
  });
});
