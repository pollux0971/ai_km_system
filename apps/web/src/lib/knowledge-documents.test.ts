import { beforeEach, describe, expect, it } from "vitest";
import {
  addKnowledgeBaseDocument,
  addKnowledgeBaseDocumentFromText,
  addKnowledgeBaseDocumentFromUrl,
  listKnowledgeBaseDocuments,
  MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER,
} from "./knowledge-documents";

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

describe("addKnowledgeBaseDocument — processing failure state (E05-S020)", () => {
  it("stamps status:failed when the name contains MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER", async () => {
    const result = await addKnowledgeBaseDocument("kb-sample-3", `毀損檔案${MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER}.pdf`, 500);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("failed");
  });

  it("leaves status undefined (ready) for an ordinarily-named file", async () => {
    const result = await addKnowledgeBaseDocument("kb-sample-3", "正常檔案.pdf", 500);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBeUndefined();
  });

  it("still returns ok:true for a processing-failed document — creation itself succeeded", async () => {
    const result = await addKnowledgeBaseDocument("kb-sample-3", `會失敗${MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER}.pdf`, 500);

    expect(result.ok).toBe(true);
  });

  it("a processing-failed document is still recorded and listed like any other", async () => {
    await addKnowledgeBaseDocument("kb-sample-3", `失敗檔案${MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER}.pdf`, 500);

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const failedDoc = listed.value.find((document) => document.name.includes("失敗檔案"));
    expect(failedDoc).toBeDefined();
    expect(failedDoc?.status).toBe("failed");
    expect(failedDoc?.sizeBytes).toBe(500);
  });

  it("the trigger match is a substring, not an exact-name match — same convention as MOCK_FILE_PROCESSING_FAILURE_TRIGGER (E03-S029)", async () => {
    const result = await addKnowledgeBaseDocument(
      "kb-sample-3",
      `報告前綴${MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER}後綴.docx`,
      500,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("failed");
  });
});

describe("addKnowledgeBaseDocumentFromUrl (E05-S014)", () => {
  it("imports a document from a valid https URL, with no sizeBytes", async () => {
    const result = await addKnowledgeBaseDocumentFromUrl("kb-sample-3", "https://example.com/report.pdf");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.knowledgeBaseId).toBe("kb-sample-3");
    expect(result.value.name).toBe("https://example.com/report.pdf");
    expect(result.value.sizeBytes).toBeUndefined();
    expect(() => new Date(result.value.uploadedAt).toISOString()).not.toThrow();

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]?.id).toBe(result.value.id);
  });

  it("imports a document from a valid http URL", async () => {
    const result = await addKnowledgeBaseDocumentFromUrl("kb-sample-3", "http://internal.example.com/doc");

    expect(result.ok).toBe(true);
  });

  it("trims surrounding whitespace from the URL", async () => {
    const result = await addKnowledgeBaseDocumentFromUrl("kb-sample-3", "  https://example.com/report.pdf  ");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("https://example.com/report.pdf");
  });

  it("rejects an empty or whitespace-only URL with VALIDATION_ERROR, without adding anything", async () => {
    const result = await addKnowledgeBaseDocumentFromUrl("kb-sample-3", "   ");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value).toEqual([]);
  });

  it("rejects a malformed URL with VALIDATION_ERROR, without adding anything", async () => {
    const result = await addKnowledgeBaseDocumentFromUrl("kb-sample-3", "not a url");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value).toEqual([]);
  });

  it("rejects a non-http(s) scheme (e.g. javascript:) with VALIDATION_ERROR, without adding anything", async () => {
    const result = await addKnowledgeBaseDocumentFromUrl("kb-sample-3", "javascript:alert(1)");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value).toEqual([]);
  });

  it("rejects a file: scheme URL with VALIDATION_ERROR", async () => {
    const result = await addKnowledgeBaseDocumentFromUrl("kb-sample-3", "file:///etc/passwd");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("fails with NOT_FOUND for a knowledge base id that doesn't exist, without adding anything", async () => {
    const result = await addKnowledgeBaseDocumentFromUrl("this-id-does-not-exist", "https://example.com/a");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("appends to the existing list without disturbing the knowledge base's other documents", async () => {
    const result = await addKnowledgeBaseDocumentFromUrl("kb-sample-1", "https://example.com/imported");
    expect(result.ok).toBe(true);

    const listed = await listKnowledgeBaseDocuments("kb-sample-1");
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(4);
    expect(listed.value.map((document) => document.name)).toEqual([
      "產品保固條款.pdf",
      "理賠申請流程.docx",
      "常見保固問題 FAQ.pdf",
      "https://example.com/imported",
    ]);
    // Every pre-existing file-sourced document still has its real sizeBytes.
    expect(listed.value.slice(0, 3).every((document) => typeof document.sizeBytes === "number")).toBe(true);
  });

  it("is a setting only — importing a URL does not remove the knowledge base from listKnowledgeBases()", async () => {
    const result = await addKnowledgeBaseDocumentFromUrl("kb-sample-3", "https://example.com/report.pdf");
    expect(result.ok).toBe(true);

    const { listKnowledgeBases } = await import("./knowledge-bases");
    const all = await listKnowledgeBases();
    expect(all.ok).toBe(true);
    if (all.ok) {
      expect(all.value.some((item) => item.id === "kb-sample-3")).toBe(true);
    }
  });
});

describe("addKnowledgeBaseDocumentFromText (E05-S015)", () => {
  it("adds a document with the given title, content, and a real computed sizeBytes", async () => {
    const result = await addKnowledgeBaseDocumentFromText("kb-sample-3", "退貨政策摘要", "商品收到 7 天內可退貨。");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.knowledgeBaseId).toBe("kb-sample-3");
    expect(result.value.name).toBe("退貨政策摘要");
    expect(result.value.content).toBe("商品收到 7 天內可退貨。");
    expect(result.value.sizeBytes).toBe(new Blob(["商品收到 7 天內可退貨。"]).size);
    expect(result.value.sizeBytes).toBeGreaterThan(0);
    expect(() => new Date(result.value.uploadedAt).toISOString()).not.toThrow();

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]?.id).toBe(result.value.id);
  });

  it("computes sizeBytes as the real UTF-8 byte length, not the character count (multi-byte text)", async () => {
    // "知識" is 2 characters but 6 UTF-8 bytes (3 bytes each).
    const result = await addKnowledgeBaseDocumentFromText("kb-sample-3", "標題", "知識");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sizeBytes).toBe(6);
  });

  it("trims surrounding whitespace from both title and content", async () => {
    const result = await addKnowledgeBaseDocumentFromText("kb-sample-3", "  標題  ", "  內容  ");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("標題");
    expect(result.value.content).toBe("內容");
  });

  it("rejects an empty or whitespace-only title with VALIDATION_ERROR, without adding anything", async () => {
    const result = await addKnowledgeBaseDocumentFromText("kb-sample-3", "   ", "有內容");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value).toEqual([]);
  });

  it("rejects an empty or whitespace-only content with VALIDATION_ERROR, without adding anything", async () => {
    const result = await addKnowledgeBaseDocumentFromText("kb-sample-3", "有標題", "   ");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value).toEqual([]);
  });

  it("fails with NOT_FOUND for a knowledge base id that doesn't exist, without adding anything", async () => {
    const result = await addKnowledgeBaseDocumentFromText("this-id-does-not-exist", "標題", "內容");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("appends to the existing list without disturbing the knowledge base's other documents", async () => {
    const result = await addKnowledgeBaseDocumentFromText("kb-sample-1", "新增知識", "這是新增的內容。");
    expect(result.ok).toBe(true);

    const listed = await listKnowledgeBaseDocuments("kb-sample-1");
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(4);
    expect(listed.value.map((document) => document.name)).toEqual([
      "產品保固條款.pdf",
      "理賠申請流程.docx",
      "常見保固問題 FAQ.pdf",
      "新增知識",
    ]);
    // Pre-existing file-sourced documents are untouched and still have no `content`.
    expect(listed.value.slice(0, 3).every((document) => document.content === undefined)).toBe(true);
  });

  it("is a setting only — adding text knowledge does not remove the knowledge base from listKnowledgeBases()", async () => {
    const result = await addKnowledgeBaseDocumentFromText("kb-sample-3", "標題", "內容");
    expect(result.ok).toBe(true);

    const { listKnowledgeBases } = await import("./knowledge-bases");
    const all = await listKnowledgeBases();
    expect(all.ok).toBe(true);
    if (all.ok) {
      expect(all.value.some((item) => item.id === "kb-sample-3")).toBe(true);
    }
  });
});
