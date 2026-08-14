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
