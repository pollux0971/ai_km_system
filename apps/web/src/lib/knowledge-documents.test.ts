import { beforeEach, describe, expect, it } from "vitest";
import { listKnowledgeBaseDocuments } from "./knowledge-documents";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("listKnowledgeBaseDocuments (E05-S010)", () => {
  it("returns the 3 seeded documents for kb-sample-1, each with the expected fields", async () => {
    const result = await listKnowledgeBaseDocuments("kb-sample-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value.map((document) => document.name)).toEqual([
      "產品保固條款.pdf",
      "理賠申請流程.docx",
      "常見保固問題 FAQ.pdf",
    ]);
    for (const document of result.value) {
      expect(typeof document.id).toBe("string");
      expect(typeof document.sizeBytes).toBe("number");
      expect(document.sizeBytes).toBeGreaterThan(0);
      expect(() => new Date(document.uploadedAt).toISOString()).not.toThrow();
    }
  });

  it("returns exactly 1 document for kb-sample-2", async () => {
    const result = await listKnowledgeBaseDocuments("kb-sample-2");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.name).toBe("設備故障排除手冊.pdf");
  });

  it("returns an empty array (not an error) for kb-sample-3, which has no documents yet", async () => {
    const result = await listKnowledgeBaseDocuments("kb-sample-3");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it("returns an empty array (not NOT_FOUND) for a knowledge base id that doesn't exist", async () => {
    const result = await listKnowledgeBaseDocuments("this-id-does-not-exist");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it("never returns a document belonging to a different knowledge base", async () => {
    const result = await listKnowledgeBaseDocuments("kb-sample-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.every((document) => document.knowledgeBaseId === "kb-sample-1")).toBe(true);
  });
});
