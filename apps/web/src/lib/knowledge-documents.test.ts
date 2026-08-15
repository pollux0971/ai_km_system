import { beforeEach, describe, expect, it } from "vitest";
import {
  addKnowledgeBaseDocument,
  addKnowledgeBaseDocumentFromText,
  addKnowledgeBaseDocumentFromUrl,
  archiveKnowledgeBaseDocument,
  deleteKnowledgeBaseDocument,
  listKnowledgeBaseDocuments,
  MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER,
  renameKnowledgeBaseDocument,
  retryDocumentProcessing,
  unarchiveKnowledgeBaseDocument,
  updateKnowledgeBaseDocumentVisibleRoles,
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

  it("defaults to excluding archived documents, and archived:true selects only archived ones (E05-S025)", async () => {
    const active = await addKnowledgeBaseDocument("kb-sample-3", "作用中文件.pdf", 100);
    const toArchive = await addKnowledgeBaseDocument("kb-sample-3", "待封存文件.pdf", 200);
    expect(active.ok).toBe(true);
    expect(toArchive.ok).toBe(true);
    if (!active.ok || !toArchive.ok) return;
    await archiveKnowledgeBaseDocument("kb-sample-3", toArchive.value.id);

    const activeView = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(activeView.ok).toBe(true);
    if (activeView.ok) {
      expect(activeView.value.some((document) => document.id === active.value.id)).toBe(true);
      expect(activeView.value.some((document) => document.id === toArchive.value.id)).toBe(false);
    }

    const archivedView = await listKnowledgeBaseDocuments("kb-sample-3", true);
    expect(archivedView.ok).toBe(true);
    if (archivedView.ok) {
      expect(archivedView.value.some((document) => document.id === toArchive.value.id)).toBe(true);
      expect(archivedView.value.some((document) => document.id === active.value.id)).toBe(false);
    }
  });
});

describe("archiveKnowledgeBaseDocument / unarchiveKnowledgeBaseDocument (E05-S025)", () => {
  it("archiveKnowledgeBaseDocument sets archived:true", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "文件.pdf", 500);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const archived = await archiveKnowledgeBaseDocument("kb-sample-3", created.value.id);

    expect(archived.ok).toBe(true);
    if (archived.ok) expect(archived.value.archived).toBe(true);
  });

  it("unarchiveKnowledgeBaseDocument sets archived:false", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "文件.pdf", 500);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await archiveKnowledgeBaseDocument("kb-sample-3", created.value.id);

    const unarchived = await unarchiveKnowledgeBaseDocument("kb-sample-3", created.value.id);

    expect(unarchived.ok).toBe(true);
    if (unarchived.ok) expect(unarchived.value.archived).toBe(false);
  });

  it("both fail with NOT_FOUND for a document id that doesn't exist", async () => {
    const archiveResult = await archiveKnowledgeBaseDocument("kb-sample-3", "this-id-does-not-exist");
    const unarchiveResult = await unarchiveKnowledgeBaseDocument("kb-sample-3", "this-id-does-not-exist");

    expect(archiveResult.ok).toBe(false);
    if (!archiveResult.ok) expect(archiveResult.error.code).toBe("NOT_FOUND");
    expect(unarchiveResult.ok).toBe(false);
    if (!unarchiveResult.ok) expect(unarchiveResult.error.code).toBe("NOT_FOUND");
  });

  it("both fail with NOT_FOUND when the document exists but belongs to a different knowledge base", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "跨庫測試.pdf", 500);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await archiveKnowledgeBaseDocument("kb-sample-1", created.value.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("does not disturb the document's other fields", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "文件.pdf", 12_345);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const archived = await archiveKnowledgeBaseDocument("kb-sample-3", created.value.id);

    expect(archived.ok).toBe(true);
    if (archived.ok) {
      expect(archived.value.id).toBe(created.value.id);
      expect(archived.value.name).toBe("文件.pdf");
      expect(archived.value.sizeBytes).toBe(12_345);
      expect(archived.value.uploadedAt).toBe(created.value.uploadedAt);
    }
  });

  it("does not affect other documents in the same knowledge base", async () => {
    const untouched = await addKnowledgeBaseDocument("kb-sample-3", "不受影響.pdf", 100);
    const toArchive = await addKnowledgeBaseDocument("kb-sample-3", "待封存.pdf", 200);
    expect(untouched.ok).toBe(true);
    expect(toArchive.ok).toBe(true);
    if (!untouched.ok || !toArchive.ok) return;

    await archiveKnowledgeBaseDocument("kb-sample-3", toArchive.value.id);

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value.find((document) => document.id === untouched.value.id)?.archived).toBeUndefined();
  });
});

describe("deleteKnowledgeBaseDocument (E05-S026)", () => {
  it("removes an existing document from the store", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "待刪除.pdf", 100);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const deleted = await deleteKnowledgeBaseDocument("kb-sample-3", created.value.id);
    expect(deleted.ok).toBe(true);

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value.some((document) => document.id === created.value.id)).toBe(false);
  });

  it("fails closed with NOT_FOUND for a document id that doesn't exist, rather than silently no-op-ing", async () => {
    const result = await deleteKnowledgeBaseDocument("kb-sample-3", "this-id-does-not-exist");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("fails closed with NOT_FOUND when the document exists but belongs to a different knowledge base", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "跨庫測試.pdf", 100);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await deleteKnowledgeBaseDocument("kb-sample-1", created.value.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("a second delete of the same (already-deleted) id fails closed with NOT_FOUND — no undefined duplicate side effect", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "待刪除.pdf", 100);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = await deleteKnowledgeBaseDocument("kb-sample-3", created.value.id);
    expect(first.ok).toBe(true);

    const second = await deleteKnowledgeBaseDocument("kb-sample-3", created.value.id);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("NOT_FOUND");
  });

  it("does not affect other documents in the same knowledge base", async () => {
    const untouched = await addKnowledgeBaseDocument("kb-sample-3", "不受影響.pdf", 100);
    const toDelete = await addKnowledgeBaseDocument("kb-sample-3", "待刪除.pdf", 200);
    expect(untouched.ok).toBe(true);
    expect(toDelete.ok).toBe(true);
    if (!untouched.ok || !toDelete.ok) return;

    await deleteKnowledgeBaseDocument("kb-sample-3", toDelete.value.id);

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value.some((document) => document.id === untouched.value.id)).toBe(true);
  });

  it("a deleted document no longer appears in either the active or archived view", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "待刪除.pdf", 100);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await archiveKnowledgeBaseDocument("kb-sample-3", created.value.id);

    await deleteKnowledgeBaseDocument("kb-sample-3", created.value.id);

    const activeView = await listKnowledgeBaseDocuments("kb-sample-3");
    const archivedView = await listKnowledgeBaseDocuments("kb-sample-3", true);
    expect(activeView.ok && !activeView.value.some((document) => document.id === created.value.id)).toBe(true);
    expect(archivedView.ok && !archivedView.value.some((document) => document.id === created.value.id)).toBe(true);
  });
});

describe("updateKnowledgeBaseDocumentVisibleRoles (E05-S027)", () => {
  it("saves the given role list", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "權限測試.pdf", 100);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateKnowledgeBaseDocumentVisibleRoles("kb-sample-3", created.value.id, ["maintenance_engineer", "knowledge_manager"]);

    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.id).toBe(created.value.id);
      expect(updated.value.visibleToRoles).toEqual(["maintenance_engineer", "knowledge_manager"]);
    }
  });

  it("accepts an empty role list as a valid, meaningful state (granted to no role), not a validation error", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "權限測試.pdf", 100);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateKnowledgeBaseDocumentVisibleRoles("kb-sample-3", created.value.id, []);

    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.value.visibleToRoles).toEqual([]);
  });

  it("is reflected by a subsequent listKnowledgeBaseDocuments() call", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "權限測試.pdf", 100);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await updateKnowledgeBaseDocumentVisibleRoles("kb-sample-3", created.value.id, ["general_user"]);
    const reloaded = await listKnowledgeBaseDocuments("kb-sample-3");

    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) expect(reloaded.value.find((document) => document.id === created.value.id)?.visibleToRoles).toEqual(["general_user"]);
  });

  it("fails closed with NOT_FOUND for a document id that doesn't exist", async () => {
    const result = await updateKnowledgeBaseDocumentVisibleRoles("kb-sample-3", "this-id-does-not-exist", ["general_user"]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("fails closed with NOT_FOUND when the document exists but belongs to a different knowledge base", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "跨庫測試.pdf", 100);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await updateKnowledgeBaseDocumentVisibleRoles("kb-sample-1", created.value.id, ["general_user"]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("does not disturb the document's name or other fields", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "權限測試.pdf", 12_345);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateKnowledgeBaseDocumentVisibleRoles("kb-sample-3", created.value.id, ["auditor"]);

    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.name).toBe("權限測試.pdf");
      expect(updated.value.sizeBytes).toBe(12_345);
      expect(updated.value.uploadedAt).toBe(created.value.uploadedAt);
    }
  });

  it("does not affect other documents in the same knowledge base", async () => {
    const untouched = await addKnowledgeBaseDocument("kb-sample-3", "不受影響.pdf", 100);
    const target = await addKnowledgeBaseDocument("kb-sample-3", "設定權限.pdf", 200);
    expect(untouched.ok).toBe(true);
    expect(target.ok).toBe(true);
    if (!untouched.ok || !target.ok) return;

    await updateKnowledgeBaseDocumentVisibleRoles("kb-sample-3", target.value.id, ["it_administrator"]);

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value.find((document) => document.id === untouched.value.id)?.visibleToRoles).toBeUndefined();
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

describe("retryDocumentProcessing (E05-S021)", () => {
  it("clears status back to ready (undefined) for a failed document", async () => {
    const created = await addKnowledgeBaseDocument(
      "kb-sample-3",
      `重試對象${MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER}.pdf`,
      500,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.status).toBe("failed");

    const retried = await retryDocumentProcessing("kb-sample-3", created.value.id);

    expect(retried.ok).toBe(true);
    if (retried.ok) expect(retried.value.status).toBeUndefined();
  });

  it("returns NOT_FOUND for a document id that doesn't exist", async () => {
    const result = await retryDocumentProcessing("kb-sample-3", "this-id-does-not-exist");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND when the document exists but belongs to a different knowledge base", async () => {
    const created = await addKnowledgeBaseDocument(
      "kb-sample-3",
      `跨庫測試${MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER}.pdf`,
      500,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await retryDocumentProcessing("kb-sample-1", created.value.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("returns VALIDATION_ERROR when attempting to retry a document that isn't currently failed", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "正常文件.pdf", 500);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.status).toBeUndefined();

    const result = await retryDocumentProcessing("kb-sample-3", created.value.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("does not disturb the document's other fields", async () => {
    const created = await addKnowledgeBaseDocument(
      "kb-sample-3",
      `保留欄位${MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER}.pdf`,
      12_345,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const retried = await retryDocumentProcessing("kb-sample-3", created.value.id);

    expect(retried.ok).toBe(true);
    if (retried.ok) {
      expect(retried.value.id).toBe(created.value.id);
      expect(retried.value.name).toBe(created.value.name);
      expect(retried.value.sizeBytes).toBe(12_345);
      expect(retried.value.uploadedAt).toBe(created.value.uploadedAt);
    }
  });

  it("does not affect other documents in the same knowledge base", async () => {
    const untouched = await addKnowledgeBaseDocument("kb-sample-3", "不受影響.pdf", 100);
    const failed = await addKnowledgeBaseDocument(
      "kb-sample-3",
      `會被重試${MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER}.pdf`,
      200,
    );
    expect(untouched.ok).toBe(true);
    expect(failed.ok).toBe(true);
    if (!untouched.ok || !failed.ok) return;

    await retryDocumentProcessing("kb-sample-3", failed.value.id);

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const other = listed.value.find((document) => document.id === untouched.value.id);
    expect(other?.status).toBeUndefined();
    expect(other?.name).toBe("不受影響.pdf");
  });
});

describe("renameKnowledgeBaseDocument (E05-S023)", () => {
  it("renames a document to the trimmed new name", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "舊名稱.pdf", 500);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const renamed = await renameKnowledgeBaseDocument("kb-sample-3", created.value.id, "  新名稱.pdf  ");

    expect(renamed.ok).toBe(true);
    if (renamed.ok) expect(renamed.value.name).toBe("新名稱.pdf");
  });

  it("returns VALIDATION_ERROR for an empty or whitespace-only name, without disturbing the existing name", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "原始名稱.pdf", 500);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await renameKnowledgeBaseDocument("kb-sample-3", created.value.id, "   ");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value.find((document) => document.id === created.value.id)?.name).toBe("原始名稱.pdf");
  });

  it("returns NOT_FOUND for a document id that doesn't exist", async () => {
    const result = await renameKnowledgeBaseDocument("kb-sample-3", "this-id-does-not-exist", "新名稱.pdf");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND when the document exists but belongs to a different knowledge base", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "跨庫測試.pdf", 500);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await renameKnowledgeBaseDocument("kb-sample-1", created.value.id, "新名稱.pdf");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("does not disturb the document's other fields", async () => {
    const created = await addKnowledgeBaseDocument("kb-sample-3", "原始名稱.pdf", 12_345);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const renamed = await renameKnowledgeBaseDocument("kb-sample-3", created.value.id, "新名稱.pdf");

    expect(renamed.ok).toBe(true);
    if (renamed.ok) {
      expect(renamed.value.id).toBe(created.value.id);
      expect(renamed.value.sizeBytes).toBe(12_345);
      expect(renamed.value.uploadedAt).toBe(created.value.uploadedAt);
    }
  });

  it("does not affect other documents in the same knowledge base", async () => {
    const untouched = await addKnowledgeBaseDocument("kb-sample-3", "不受影響.pdf", 100);
    const toRename = await addKnowledgeBaseDocument("kb-sample-3", "待重新命名.pdf", 200);
    expect(untouched.ok).toBe(true);
    expect(toRename.ok).toBe(true);
    if (!untouched.ok || !toRename.ok) return;

    await renameKnowledgeBaseDocument("kb-sample-3", toRename.value.id, "已重新命名.pdf");

    const listed = await listKnowledgeBaseDocuments("kb-sample-3");
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.find((document) => document.id === untouched.value.id)?.name).toBe("不受影響.pdf");
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
