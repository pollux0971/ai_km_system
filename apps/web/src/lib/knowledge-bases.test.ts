import { describe, expect, it } from "vitest";
import { createKnowledgeBase, listKnowledgeBases } from "./knowledge-bases";

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
