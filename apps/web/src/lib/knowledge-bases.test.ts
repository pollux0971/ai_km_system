import { describe, expect, it } from "vitest";
import {
  createKnowledgeBase,
  getKnowledgeBase,
  listKnowledgeBases,
  updateKnowledgeBase,
  updateKnowledgeBaseBoundPrompt,
  updateKnowledgeBaseMembers,
  updateKnowledgeBaseVisibleRoles,
} from "./knowledge-bases";

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

describe("createKnowledgeBase (E05-S003)", () => {
  // This file's sessionStorage-backed store is shared and accumulates
  // across every test that calls createKnowledgeBase() within this same
  // run (same pattern lib/conversations.test.ts's pagination/search
  // blocks already rely on for createConversation()) — this block runs
  // after the pure-read S001/S002 blocks above, so it never affects
  // their assertions against the pristine 3-item seed. Names used below
  // ("研發部門知識庫", "行銷部門知識庫") are chosen to share no substring
  // with any seed name or with the S002 block's search terms above.

  it("creates a knowledge base with the given name and description, trimmed", async () => {
    const result = await createKnowledgeBase("  研發部門知識庫  ", "  內部技術文件與架構決策紀錄。  ");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("研發部門知識庫");
      expect(result.value.description).toBe("內部技術文件與架構決策紀錄。");
      expect(result.value.id).toBeTruthy();
      expect(result.value.updatedAt).toBeTruthy();
    }
  });

  it("defaults description to an empty string when omitted or whitespace-only", async () => {
    const omitted = await createKnowledgeBase("行銷部門知識庫");
    const whitespaceOnly = await createKnowledgeBase("行銷部門知識庫（草稿）", "   ");

    expect(omitted.ok && whitespaceOnly.ok).toBe(true);
    if (!omitted.ok || !whitespaceOnly.ok) return;
    expect(omitted.value.description).toBe("");
    expect(whitespaceOnly.value.description).toBe("");
  });

  it("fails with VALIDATION_ERROR for an empty or whitespace-only name, with no side effect on the store", async () => {
    const before = await listKnowledgeBases();
    expect(before.ok).toBe(true);
    if (!before.ok) return;

    const emptyResult = await createKnowledgeBase("");
    const whitespaceResult = await createKnowledgeBase("   ");

    expect(emptyResult.ok).toBe(false);
    if (!emptyResult.ok) expect(emptyResult.error.code).toBe("VALIDATION_ERROR");
    expect(whitespaceResult.ok).toBe(false);
    if (!whitespaceResult.ok) expect(whitespaceResult.error.code).toBe("VALIDATION_ERROR");

    const after = await listKnowledgeBases();
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.value).toEqual(before.value);
  });

  it("prepends the new knowledge base so it appears first in listKnowledgeBases()", async () => {
    const created = await createKnowledgeBase("客服部門知識庫");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const after = await listKnowledgeBases();
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.value[0]).toEqual(created.value);
  });

  it("generates a unique id for each created knowledge base", async () => {
    const first = await createKnowledgeBase("法務部門知識庫（一）");
    const second = await createKnowledgeBase("法務部門知識庫（二）");

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.id).not.toBe(second.value.id);
  });
});

describe("getKnowledgeBase (E05-S004)", () => {
  it("resolves an existing knowledge base by id", async () => {
    const result = await getKnowledgeBase("kb-sample-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value?.id).toBe("kb-sample-1");
      expect(result.value?.name).toBe("產品保固政策");
    }
  });

  it("resolves null (not an error) for an id that doesn't match anything", async () => {
    const result = await getKnowledgeBase("this-id-does-not-exist");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });
});

describe("updateKnowledgeBase (E05-S004)", () => {
  // Same shared-sessionStorage-store reasoning as the createKnowledgeBase
  // block above — this block only ever updates knowledge bases it itself
  // creates first, so it never depends on (or disturbs) the seed data or
  // any other describe block's assertions.

  it("updates the name and description, trimmed, and refreshes updatedAt", async () => {
    const created = await createKnowledgeBase("客服知識庫（編輯前）", "編輯前的說明。");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateKnowledgeBase(created.value.id, "  客服知識庫（編輯後）  ", "  編輯後的說明。  ");

    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.id).toBe(created.value.id);
      expect(updated.value.name).toBe("客服知識庫（編輯後）");
      expect(updated.value.description).toBe("編輯後的說明。");
      // >= rather than a strict "changed" comparison — two back-to-back
      // new Date().toISOString() calls can legitimately land in the same
      // millisecond, so this only asserts updatedAt is well-formed and
      // never moves backwards, not that it strictly advanced.
      expect(new Date(updated.value.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.value.updatedAt).getTime());
    }
  });

  it("is reflected by a subsequent getKnowledgeBase() call", async () => {
    const created = await createKnowledgeBase("業務知識庫（編輯前）");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await updateKnowledgeBase(created.value.id, "業務知識庫（編輯後）", "更新後的說明。");
    const reloaded = await getKnowledgeBase(created.value.id);

    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value?.name).toBe("業務知識庫（編輯後）");
      expect(reloaded.value?.description).toBe("更新後的說明。");
    }
  });

  it("fails with VALIDATION_ERROR for an empty or whitespace-only name, with no side effect", async () => {
    const created = await createKnowledgeBase("財務知識庫（編輯前）");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const emptyResult = await updateKnowledgeBase(created.value.id, "");
    const whitespaceResult = await updateKnowledgeBase(created.value.id, "   ");

    expect(emptyResult.ok).toBe(false);
    if (!emptyResult.ok) expect(emptyResult.error.code).toBe("VALIDATION_ERROR");
    expect(whitespaceResult.ok).toBe(false);
    if (!whitespaceResult.ok) expect(whitespaceResult.error.code).toBe("VALIDATION_ERROR");

    const unchanged = await getKnowledgeBase(created.value.id);
    expect(unchanged.ok).toBe(true);
    if (unchanged.ok) expect(unchanged.value).toEqual(created.value);
  });

  it("fails with NOT_FOUND for an id that doesn't match anything", async () => {
    const result = await updateKnowledgeBase("this-id-does-not-exist", "新名稱");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("preserves the knowledge base's existing position in listKnowledgeBases() (no reordering on edit)", async () => {
    const first = await createKnowledgeBase("行政知識庫（一）");
    const second = await createKnowledgeBase("行政知識庫（二）");
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    // second was created after first, so it's prepended above first.
    const before = await listKnowledgeBases();
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const firstIndexBefore = before.value.findIndex((item) => item.id === first.value.id);

    await updateKnowledgeBase(first.value.id, "行政知識庫（一，已編輯）");

    const after = await listKnowledgeBases();
    expect(after.ok).toBe(true);
    if (after.ok) {
      const firstIndexAfter = after.value.findIndex((item) => item.id === first.value.id);
      expect(firstIndexAfter).toBe(firstIndexBefore);
    }
  });
});

describe("updateKnowledgeBaseVisibleRoles (E05-S006)", () => {
  it("saves the given role list and refreshes updatedAt", async () => {
    const created = await createKnowledgeBase("維修知識庫（權限測試）");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateKnowledgeBaseVisibleRoles(created.value.id, ["maintenance_engineer", "knowledge_manager"]);

    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.id).toBe(created.value.id);
      expect(updated.value.visibleToRoles).toEqual(["maintenance_engineer", "knowledge_manager"]);
      expect(new Date(updated.value.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.value.updatedAt).getTime());
    }
  });

  it("accepts an empty role list as a valid, meaningful state (granted to no role), not a validation error", async () => {
    const created = await createKnowledgeBase("業務知識庫（權限測試）");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateKnowledgeBaseVisibleRoles(created.value.id, []);

    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.value.visibleToRoles).toEqual([]);
  });

  it("is reflected by a subsequent getKnowledgeBase() call", async () => {
    const created = await createKnowledgeBase("行政知識庫（權限測試）");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await updateKnowledgeBaseVisibleRoles(created.value.id, ["general_user"]);
    const reloaded = await getKnowledgeBase(created.value.id);

    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) expect(reloaded.value?.visibleToRoles).toEqual(["general_user"]);
  });

  it("does not disturb the knowledge base's name or description", async () => {
    const created = await createKnowledgeBase("財務知識庫（權限測試）", "財務相關文件。");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateKnowledgeBaseVisibleRoles(created.value.id, ["it_administrator"]);

    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.name).toBe("財務知識庫（權限測試）");
      expect(updated.value.description).toBe("財務相關文件。");
    }
  });

  it("fails with NOT_FOUND for an id that doesn't match anything", async () => {
    const result = await updateKnowledgeBaseVisibleRoles("this-id-does-not-exist", ["general_user"]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("is a setting only — restricting visibleToRoles does not remove the knowledge base from listKnowledgeBases(), because this codebase has no real per-viewer enforcement to apply it (see this function's own doc comment)", async () => {
    const created = await createKnowledgeBase("稽核知識庫（權限測試）");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await updateKnowledgeBaseVisibleRoles(created.value.id, ["super_administrator"]);

    const all = await listKnowledgeBases();
    expect(all.ok).toBe(true);
    if (all.ok) {
      expect(all.value.some((item) => item.id === created.value.id)).toBe(true);
    }
  });
});

describe("updateKnowledgeBaseMembers (E05-S007)", () => {
  it("saves the given member list and refreshes updatedAt", async () => {
    const created = await createKnowledgeBase("客服知識庫（成員測試）");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateKnowledgeBaseMembers(created.value.id, ["demo-user", "demo-maintenance"]);

    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.id).toBe(created.value.id);
      expect(updated.value.members).toEqual(["demo-user", "demo-maintenance"]);
      expect(new Date(updated.value.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.value.updatedAt).getTime());
    }
  });

  it("trims, drops empty entries, and de-duplicates, rather than failing with a validation error", async () => {
    const created = await createKnowledgeBase("業務知識庫（成員測試）");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateKnowledgeBaseMembers(created.value.id, ["  demo-user  ", "", "   ", "demo-user"]);

    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.value.members).toEqual(["demo-user"]);
  });

  it("accepts an empty member list as a valid, meaningful state (no members), not a validation error", async () => {
    const created = await createKnowledgeBase("行政知識庫（成員測試）");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateKnowledgeBaseMembers(created.value.id, []);

    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.value.members).toEqual([]);
  });

  it("is reflected by a subsequent getKnowledgeBase() call", async () => {
    const created = await createKnowledgeBase("財務知識庫（成員測試）");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await updateKnowledgeBaseMembers(created.value.id, ["demo-sales"]);
    const reloaded = await getKnowledgeBase(created.value.id);

    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) expect(reloaded.value?.members).toEqual(["demo-sales"]);
  });

  it("does not disturb the knowledge base's name, description, or visibleToRoles", async () => {
    const created = await createKnowledgeBase("稽核知識庫（成員測試）", "稽核相關文件。");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await updateKnowledgeBaseVisibleRoles(created.value.id, ["auditor"]);

    const updated = await updateKnowledgeBaseMembers(created.value.id, ["demo-user"]);

    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.name).toBe("稽核知識庫（成員測試）");
      expect(updated.value.description).toBe("稽核相關文件。");
      expect(updated.value.visibleToRoles).toEqual(["auditor"]);
    }
  });

  it("fails with NOT_FOUND for an id that doesn't match anything", async () => {
    const result = await updateKnowledgeBaseMembers("this-id-does-not-exist", ["demo-user"]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("is a setting only — adding members does not remove the knowledge base from listKnowledgeBases() for any other caller, because this codebase has no real per-viewer enforcement to apply it", async () => {
    const created = await createKnowledgeBase("系統知識庫（成員測試）");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await updateKnowledgeBaseMembers(created.value.id, ["demo-user"]);

    const all = await listKnowledgeBases();
    expect(all.ok).toBe(true);
    if (all.ok) {
      expect(all.value.some((item) => item.id === created.value.id)).toBe(true);
    }
  });
});

describe("updateKnowledgeBaseBoundPrompt (E05-S008)", () => {
  it("saves the trimmed prompt text and refreshes updatedAt", async () => {
    const created = await createKnowledgeBase("客服知識庫（提示詞測試）");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateKnowledgeBaseBoundPrompt(created.value.id, "  請用友善、簡潔的語氣回答客服問題。  ");

    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.id).toBe(created.value.id);
      expect(updated.value.boundPrompt).toBe("請用友善、簡潔的語氣回答客服問題。");
      expect(new Date(updated.value.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.value.updatedAt).getTime());
    }
  });

  it("accepts an empty or whitespace-only prompt as a valid, meaningful state (no custom prompt bound), not a validation error", async () => {
    const created = await createKnowledgeBase("業務知識庫（提示詞測試）");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const empty = await updateKnowledgeBaseBoundPrompt(created.value.id, "");
    const whitespaceOnly = await updateKnowledgeBaseBoundPrompt(created.value.id, "   ");

    expect(empty.ok && whitespaceOnly.ok).toBe(true);
    if (!empty.ok || !whitespaceOnly.ok) return;
    expect(empty.value.boundPrompt).toBe("");
    expect(whitespaceOnly.value.boundPrompt).toBe("");
  });

  it("is reflected by a subsequent getKnowledgeBase() call", async () => {
    const created = await createKnowledgeBase("行政知識庫（提示詞測試）");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await updateKnowledgeBaseBoundPrompt(created.value.id, "回答時請引用相關規範條號。");
    const reloaded = await getKnowledgeBase(created.value.id);

    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) expect(reloaded.value?.boundPrompt).toBe("回答時請引用相關規範條號。");
  });

  it("does not disturb the knowledge base's name, description, visibleToRoles, or members", async () => {
    const created = await createKnowledgeBase("財務知識庫（提示詞測試）", "財務相關文件。");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await updateKnowledgeBaseVisibleRoles(created.value.id, ["auditor"]);
    await updateKnowledgeBaseMembers(created.value.id, ["demo-user"]);

    const updated = await updateKnowledgeBaseBoundPrompt(created.value.id, "請謹慎核對數字。");

    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.name).toBe("財務知識庫（提示詞測試）");
      expect(updated.value.description).toBe("財務相關文件。");
      expect(updated.value.visibleToRoles).toEqual(["auditor"]);
      expect(updated.value.members).toEqual(["demo-user"]);
    }
  });

  it("fails with NOT_FOUND for an id that doesn't match anything", async () => {
    const result = await updateKnowledgeBaseBoundPrompt("this-id-does-not-exist", "測試提示詞");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("is a setting only — binding a prompt does not remove the knowledge base from listKnowledgeBases()", async () => {
    const created = await createKnowledgeBase("稽核知識庫（提示詞測試）");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await updateKnowledgeBaseBoundPrompt(created.value.id, "測試提示詞內容。");

    const all = await listKnowledgeBases();
    expect(all.ok).toBe(true);
    if (all.ok) {
      expect(all.value.some((item) => item.id === created.value.id)).toBe(true);
    }
  });
});
