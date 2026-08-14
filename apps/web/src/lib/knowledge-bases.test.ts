import { describe, expect, it } from "vitest";
import { listKnowledgeBases } from "./knowledge-bases";

describe("listKnowledgeBases (E05-S001)", () => {
  it("resolves with a non-empty list of knowledge base summaries", async () => {
    const result = await listKnowledgeBases();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      for (const item of result.value) {
        expect(item.id).toBeTruthy();
        expect(item.name).toBeTruthy();
        expect(item.description).toBeTruthy();
        expect(item.updatedAt).toBeTruthy();
      }
    }
  });

  it("returns the same items on repeated calls (stable across the session)", async () => {
    const first = await listKnowledgeBases();
    const second = await listKnowledgeBases();

    expect(first).toEqual(second);
  });
});

describe("listKnowledgeBases search (E05-S002)", () => {
  it("an empty or whitespace-only query returns everything unfiltered, same as no query at all", async () => {
    const noQuery = await listKnowledgeBases();
    const emptyQuery = await listKnowledgeBases("");
    const whitespaceQuery = await listKnowledgeBases("   ");

    expect(noQuery.ok && emptyQuery.ok && whitespaceQuery.ok).toBe(true);
    if (!noQuery.ok || !emptyQuery.ok || !whitespaceQuery.ok) return;
    expect(emptyQuery.value).toEqual(noQuery.value);
    expect(whitespaceQuery.value).toEqual(noQuery.value);
  });

  it("matches a substring of the name", async () => {
    const result = await listKnowledgeBases("產品");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe("產品保固政策");
    }
  });

  it("a query matching nothing resolves with an empty array, not an error", async () => {
    const result = await listKnowledgeBases("沒有任何知識庫會符合這串文字");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it("does not match description content, only name", async () => {
    // "理賠" only appears in kb-sample-1's description ("...理賠流程等
    // 相關文件。"), not in any knowledge base's name.
    const result = await listKnowledgeBases("理賠");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});
