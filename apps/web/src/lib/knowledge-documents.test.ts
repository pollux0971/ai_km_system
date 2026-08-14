import { beforeEach, describe, expect, it } from "vitest";
import { addKnowledgeBaseDocument, listKnowledgeBaseDocuments } from "./knowledge-documents";

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

describe("addKnowledgeBaseDocument (E05-S011)", () => {
  it("adds a document to a knowledge base that previously had none", async () => {
    const added = await addKnowledgeBaseDocument("kb-sample-3", "新規章程.pdf", 50_000);

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value.knowledgeBaseId).toBe("kb-sample-3");
    expect(added.value.name).toBe("新規章程.pdf");
    expect(added.value.sizeBytes).toBe(50_000);
    expect(typeof added.value.id).toBe("string");
    expect(added.value.id.length).toBeGreaterThan(0);
    expect(() => new Date(added.value.uploadedAt).toISOString()).not.toThrow();

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]?.id).toBe(added.value.id);
  });

  it("trims surrounding whitespace from the file name", async () => {
    const added = await addKnowledgeBaseDocument("kb-sample-3", "  空白測試.txt  ", 100);

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value.name).toBe("空白測試.txt");
  });

  it("rejects an empty or whitespace-only file name with VALIDATION_ERROR, without adding anything", async () => {
    const result = await addKnowledgeBaseDocument("kb-sample-3", "   ", 100);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value).toEqual([]);
  });

  it("fails with NOT_FOUND for a knowledge base id that doesn't exist, without adding anything", async () => {
    const result = await addKnowledgeBaseDocument("this-id-does-not-exist", "a.pdf", 100);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("appends to the existing list without disturbing the knowledge base's other documents", async () => {
    const added = await addKnowledgeBaseDocument("kb-sample-1", "新增附件.pdf", 10_000);
    expect(added.ok).toBe(true);

    const listed = await listKnowledgeBaseDocuments("kb-sample-1");
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(4);
    expect(listed.value.map((document) => document.name)).toEqual([
      "產品保固條款.pdf",
      "理賠申請流程.docx",
      "常見保固問題 FAQ.pdf",
      "新增附件.pdf",
    ]);
  });

  it("does not leak the newly added document into a different knowledge base's list", async () => {
    await addKnowledgeBaseDocument("kb-sample-3", "只屬於三號.pdf", 10_000);

    const listedOther = await listKnowledgeBaseDocuments("kb-sample-2");
    expect(listedOther.ok).toBe(true);
    if (!listedOther.ok) return;
    expect(listedOther.value.some((document) => document.name === "只屬於三號.pdf")).toBe(false);
  });
});
