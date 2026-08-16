import { describe, expect, it } from "vitest";
import { getErpQuery, listErpQueries, submitErpQuery } from "./erp-queries";

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

describe("getErpQuery (E09-S002)", () => {
  it("resolves the matching query when the id exists", async () => {
    const result = await getErpQuery("erp-query-sample-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value?.id).toBe("erp-query-sample-1");
    expect(result.value?.questionText).toBe("上個月各分公司的營收總額是多少?");
  });

  it("resolves null (not an error) for an unknown id", async () => {
    const result = await getErpQuery("not-a-real-query-id");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });
});

describe("submitErpQuery (E09-S002)", () => {
  it("creates a query with the trimmed question text and adds it to listErpQueries", async () => {
    const before = await listErpQueries();
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const countBefore = before.value.length;

    const result = await submitErpQuery("  上季各產品線的毛利率是多少?  ");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.questionText).toBe("上季各產品線的毛利率是多少?");
    expect(result.value.id).toBeTruthy();
    expect(result.value.createdAt).toBeTruthy();

    const after = await listErpQueries();
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.length).toBe(countBefore + 1);

    const fetched = await getErpQuery(result.value.id);
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.value?.questionText).toBe("上季各產品線的毛利率是多少?");
  });

  it("fails with VALIDATION_ERROR for an empty or whitespace-only question, with no side effect on the store", async () => {
    const before = await listErpQueries();
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const countBefore = before.value.length;

    const emptyResult = await submitErpQuery("");
    const whitespaceResult = await submitErpQuery("   ");

    expect(emptyResult.ok).toBe(false);
    if (!emptyResult.ok) expect(emptyResult.error.code).toBe("VALIDATION_ERROR");
    expect(whitespaceResult.ok).toBe(false);
    if (!whitespaceResult.ok) expect(whitespaceResult.error.code).toBe("VALIDATION_ERROR");

    const after = await listErpQueries();
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.length).toBe(countBefore);
  });
});
