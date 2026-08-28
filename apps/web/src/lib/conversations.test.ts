import { describe, expect, it } from "vitest";
import { failNextRequest, failNextRequestWithNetworkError } from "@/test/fake-api";
import {
  CONVERSATIONS_PAGE_SIZE,
  archiveConversation,
  createConversation,
  deleteConversation,
  getConversation,
  getRecentConversations,
  listActiveConversations,
  listConversations,
  renameConversation,
  setConversationKnowledgeScopes,
  setConversationMode,
  setConversationModel,
  unarchiveConversation,
} from "./conversations";

/**
 * E03-S036: a syntactically valid UUID that is never seeded or created, for exercising
 * the "id doesn't exist" path. Pre-S036 tests used the literal string "does-not-exist"
 * for this — that stopped working once conversations moved off a plain in-memory array
 * and onto the real contract, whose `conversationId` path parameter is `format: uuid`;
 * a non-UUID id now fails closed with 400 VALIDATION_ERROR (a real server would reject
 * it identically) before ever reaching the "not found" check. Every occurrence below
 * that used to read "does-not-exist" now uses this constant instead — the INTENT of
 * each test (exercise the not-found path) is unchanged; only the sentinel value is.
 */
const NONEXISTENT_ID = "00000000-0000-4000-8000-000000000000";

describe("getRecentConversations", () => {
  it("resolves with a non-empty list of conversation summaries", async () => {
    const result = await getRecentConversations();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      for (const item of result.value) {
        expect(item.id).toBeTruthy();
        expect(item.title).toBeTruthy();
        expect(item.lastMessageAt).toBeTruthy();
        expect(item.lastMessagePreview).toBeTruthy();
      }
    }
  });

  it("never returns more than 3 items, even after new conversations are created", async () => {
    await createConversation();
    await createConversation();

    const result = await getRecentConversations();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeLessThanOrEqual(3);
    }
  });
});

describe("listConversations (E03-S001)", () => {
  it("resolves with a non-empty page of items sharing the same shape as getRecentConversations", async () => {
    const result = await listConversations();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items.length).toBeGreaterThan(0);
      for (const item of result.value.items) {
        expect(item.id).toBeTruthy();
        expect(item.title).toBeTruthy();
        expect(item.lastMessageAt).toBeTruthy();
        expect(item.lastMessagePreview).toBeTruthy();
      }
    }
  });

  it("totalCount grows by exactly one after createConversation()", async () => {
    const before = await listConversations();
    expect(before.ok).toBe(true);
    const countBefore = before.ok ? before.value.totalCount : -1;

    await createConversation();

    const after = await listConversations();
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.value.totalCount).toBe(countBefore + 1);
    }
  });
});

describe("listConversations pagination (E03-S022)", () => {
  it("defaults to page 1 and returns at most CONVERSATIONS_PAGE_SIZE items", async () => {
    const result = await listConversations();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.page).toBe(1);
      expect(result.value.pageSize).toBe(CONVERSATIONS_PAGE_SIZE);
      expect(result.value.items.length).toBeLessThanOrEqual(CONVERSATIONS_PAGE_SIZE);
    }
  });

  it("reports totalPages consistent with totalCount", async () => {
    // Not a hardcoded expected totalCount — this file's sessionStorage-
    // backed store is shared and accumulates across every test/describe
    // block that calls createConversation() within this same run (same
    // pattern getRecentConversations's "never returns more than 3 items"
    // test already relies on), so only the totalCount/totalPages
    // RELATIONSHIP is something this test can reliably assert.
    const result = await listConversations();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalPages).toBe(Math.ceil(result.value.totalCount / CONVERSATIONS_PAGE_SIZE));
    }
  });

  it("page 2 contains different items than page 1, with no overlap", async () => {
    const page1 = await listConversations(1);
    const page2 = await listConversations(2);

    expect(page1.ok && page2.ok).toBe(true);
    if (!page1.ok || !page2.ok) return;

    const page1Ids = page1.value.items.map((item) => item.id);
    const page2Ids = page2.value.items.map((item) => item.id);
    expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
  });

  it("a page far beyond the last one resolves with an empty items array, not an error, and totalCount/totalPages stay accurate", async () => {
    const reference = await listConversations();
    expect(reference.ok).toBe(true);
    if (!reference.ok) return;

    const result = await listConversations(999999);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toEqual([]);
      // Independent reviewer MINOR finding: an out-of-range page must
      // not report the dataset as empty just because ITS OWN slice is —
      // totalCount/totalPages are computed from the full store before
      // slicing (see listConversations), so they should match a normal
      // in-range call made around the same time.
      expect(result.value.totalCount).toBe(reference.value.totalCount);
      expect(result.value.totalPages).toBe(reference.value.totalPages);
    }
  });

  it("clamps a page below 1 to page 1 rather than failing", async () => {
    const zero = await listConversations(0);
    const negative = await listConversations(-5);
    const page1 = await listConversations(1);

    expect(zero.ok && negative.ok && page1.ok).toBe(true);
    if (!zero.ok || !negative.ok || !page1.ok) return;
    expect(zero.value.items).toEqual(page1.value.items);
    expect(negative.value.items).toEqual(page1.value.items);
  });

  it("a newly created conversation appears on page 1 (prepended), shifting later items onto later pages", async () => {
    const before = await listConversations(1);
    expect(before.ok).toBe(true);
    if (!before.ok) return;

    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const after = await listConversations(1);
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.value.items[0]).toEqual(created.value);
    }
  });
});

describe("listConversations search (E03-S023)", () => {
  // Search assertions below use substrings unique to one seed title
  // ("產品保固政策詢問", "設備 E-204 錯誤代碼排查", "Q3 銷售報表彙整") —
  // safe to assert an exact match count of 1 even though this file's
  // shared sessionStorage store accumulates createConversation() calls
  // across tests, because every created conversation is always titled
  // "新對話" (see createConversation's fixed default), which shares no
  // substring with any seed title searched for here.

  it("an empty or whitespace-only query returns everything unfiltered, same as no query at all", async () => {
    const noQuery = await listConversations(1);
    const emptyQuery = await listConversations(1, "");
    const whitespaceQuery = await listConversations(1, "   ");

    expect(noQuery.ok && emptyQuery.ok && whitespaceQuery.ok).toBe(true);
    if (!noQuery.ok || !emptyQuery.ok || !whitespaceQuery.ok) return;
    expect(emptyQuery.value).toEqual(noQuery.value);
    expect(whitespaceQuery.value).toEqual(noQuery.value);
  });

  it("matches a substring of the title, case-sensitively-typed-but-case-insensitively-matched", async () => {
    const result = await listConversations(1, "產品");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalCount).toBe(1);
      expect(result.value.items[0]?.title).toBe("產品保固政策詢問");
    }
  });

  it("matches ASCII letters case-insensitively", async () => {
    const result = await listConversations(1, "e-204");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalCount).toBe(1);
      expect(result.value.items[0]?.title).toBe("設備 E-204 錯誤代碼排查");
    }
  });

  it("a query matching nothing resolves with an empty items array and totalCount 0, not an error", async () => {
    const result = await listConversations(1, "沒有任何對話會符合這串文字");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toEqual([]);
      expect(result.value.totalCount).toBe(0);
      expect(result.value.totalPages).toBe(1);
    }
  });

  it("totalPages reflects the FILTERED result count, not the full unfiltered dataset", async () => {
    // "報" only matches "Q3 銷售報表彙整" — a single-item filtered set
    // must report totalPages 1, even though CONVERSATIONS_PAGE_SIZE (2)
    // would put the unfiltered dataset's 3+ items across 2+ pages.
    const result = await listConversations(1, "報");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalCount).toBe(1);
      expect(result.value.totalPages).toBe(1);
    }
  });

  it("does not match lastMessagePreview content, only title", async () => {
    // Seed data: "產品保固政策詢問"'s preview contains "原廠零件", which
    // doesn't appear in any seed title.
    const result = await listConversations(1, "原廠零件");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toEqual([]);
    }
  });
});

describe("createConversation (E03-S001)", () => {
  it("creates a conversation with a default title and prepends it to the full list", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.value.id).toBeTruthy();
    expect(created.value.title).toBe("新對話");
    expect(created.value.lastMessageAt).toBeTruthy();

    const list = await listConversations();
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.items[0]).toEqual(created.value);
    }
  });

  it("generates a unique id for each call", async () => {
    const a = await createConversation();
    const b = await createConversation();

    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value.id).not.toBe(b.value.id);
    }
  });

  it("E03-S002: defaults every new conversation to normal mode", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.mode).toBe("normal");
    }
  });

  it("E03-S003/S004: defaults every new conversation to no knowledge scopes selected", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.knowledgeScopes).toEqual([]);
    }
  });

  it("E03-S005: defaults every new conversation to the standard model", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.model).toBe("standard");
    }
  });
});

describe("getConversation (E03-S002)", () => {
  it("resolves the conversation matching the given id", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await getConversation(created.value.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(created.value);
    }
  });

  it("resolves with null (not an error) for an id that doesn't exist", async () => {
    const result = await getConversation(NONEXISTENT_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });
});

describe("setConversationMode (E03-S002)", () => {
  it("switches an existing conversation's mode and persists it", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.mode).toBe("normal");

    const switched = await setConversationMode(created.value.id, "advanced");
    expect(switched.ok).toBe(true);
    if (switched.ok) {
      expect(switched.value.mode).toBe("advanced");
    }

    const reloaded = await getConversation(created.value.id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value?.mode).toBe("advanced");
    }
  });

  it("fails closed with NOT_FOUND for an id that doesn't exist, rather than silently no-op-ing", async () => {
    const result = await setConversationMode(NONEXISTENT_ID, "advanced");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("only changes the mode field, leaving the rest of the conversation untouched", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const switched = await setConversationMode(created.value.id, "advanced");
    expect(switched.ok).toBe(true);
    if (switched.ok) {
      expect(switched.value.id).toBe(created.value.id);
      expect(switched.value.title).toBe(created.value.title);
      expect(switched.value.lastMessageAt).toBe(created.value.lastMessageAt);
      expect(switched.value.lastMessagePreview).toBe(created.value.lastMessagePreview);
    }
  });
});

describe("setConversationKnowledgeScopes (E03-S004)", () => {
  it("replaces an existing conversation's knowledge scopes and persists them", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.knowledgeScopes).toEqual([]);

    const switched = await setConversationKnowledgeScopes(created.value.id, ["department", "qna"]);
    expect(switched.ok).toBe(true);
    if (switched.ok) {
      expect(switched.value.knowledgeScopes).toEqual(["department", "qna"]);
    }

    const reloaded = await getConversation(created.value.id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value?.knowledgeScopes).toEqual(["department", "qna"]);
    }
  });

  it("can switch back to an empty selection (unselecting everything)", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await setConversationKnowledgeScopes(created.value.id, ["company"]);
    const unselected = await setConversationKnowledgeScopes(created.value.id, []);

    expect(unselected.ok).toBe(true);
    if (unselected.ok) {
      expect(unselected.value.knowledgeScopes).toEqual([]);
    }
  });

  it("replaces the full selection each call, rather than merging with the previous one", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await setConversationKnowledgeScopes(created.value.id, ["company", "department"]);
    const replaced = await setConversationKnowledgeScopes(created.value.id, ["qna"]);

    expect(replaced.ok).toBe(true);
    if (replaced.ok) {
      expect(replaced.value.knowledgeScopes).toEqual(["qna"]);
    }
  });

  it("fails closed with NOT_FOUND for an id that doesn't exist, rather than silently no-op-ing", async () => {
    const result = await setConversationKnowledgeScopes(NONEXISTENT_ID, ["company"]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("does not affect a conversation's mode", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const switched = await setConversationKnowledgeScopes(created.value.id, ["private"]);
    expect(switched.ok).toBe(true);
    if (switched.ok) {
      expect(switched.value.mode).toBe(created.value.mode);
    }
  });
});

describe("setConversationModel (E03-S005)", () => {
  it("switches an existing conversation's model and persists it", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.model).toBe("standard");

    const switched = await setConversationModel(created.value.id, "advanced-local");
    expect(switched.ok).toBe(true);
    if (switched.ok) {
      expect(switched.value.model).toBe("advanced-local");
    }

    const reloaded = await getConversation(created.value.id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value?.model).toBe("advanced-local");
    }
  });

  it("fails closed with VALIDATION_ERROR for the disabled 'cloud' model, not just relying on the UI's disabled <option> — SOURCE_BASELINE decision #29 (外部 Cloud LLM 預設關閉)", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await setConversationModel(created.value.id, "cloud");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }

    const reloaded = await getConversation(created.value.id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value?.model).toBe("standard");
    }
  });

  it("fails closed with NOT_FOUND for an id that doesn't exist, rather than silently no-op-ing", async () => {
    const result = await setConversationModel(NONEXISTENT_ID, "advanced-local");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("does not affect a conversation's mode or knowledge scopes", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const switched = await setConversationModel(created.value.id, "advanced-local");
    expect(switched.ok).toBe(true);
    if (switched.ok) {
      expect(switched.value.mode).toBe(created.value.mode);
      expect(switched.value.knowledgeScopes).toEqual(created.value.knowledgeScopes);
    }
  });
});

describe("renameConversation (E03-S024)", () => {
  it("renames an existing conversation and persists it", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.title).toBe("新對話");

    const renamed = await renameConversation(created.value.id, "季度預算討論");
    expect(renamed.ok).toBe(true);
    if (renamed.ok) {
      expect(renamed.value.title).toBe("季度預算討論");
    }

    const reloaded = await getConversation(created.value.id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value?.title).toBe("季度預算討論");
    }
  });

  it("trims surrounding whitespace before storing", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const renamed = await renameConversation(created.value.id, "  季度預算討論  ");
    expect(renamed.ok).toBe(true);
    if (renamed.ok) {
      expect(renamed.value.title).toBe("季度預算討論");
    }
  });

  it("fails closed with VALIDATION_ERROR for an empty title, not producing a partial rename", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await renameConversation(created.value.id, "");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }

    const reloaded = await getConversation(created.value.id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value?.title).toBe("新對話");
    }
  });

  it("fails closed with VALIDATION_ERROR for a whitespace-only title", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await renameConversation(created.value.id, "   ");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("fails closed with NOT_FOUND for an id that doesn't exist, rather than silently no-op-ing", async () => {
    const result = await renameConversation(NONEXISTENT_ID, "新標題");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("does not affect a conversation's mode, knowledge scopes, or model", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const renamed = await renameConversation(created.value.id, "新標題");
    expect(renamed.ok).toBe(true);
    if (renamed.ok) {
      expect(renamed.value.mode).toBe(created.value.mode);
      expect(renamed.value.knowledgeScopes).toEqual(created.value.knowledgeScopes);
      expect(renamed.value.model).toBe(created.value.model);
    }
  });

  it("does not affect other conversations", async () => {
    const a = await createConversation();
    const b = await createConversation();
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    await renameConversation(a.value.id, "只改這個");

    const reloadedB = await getConversation(b.value.id);
    expect(reloadedB.ok).toBe(true);
    if (reloadedB.ok) {
      expect(reloadedB.value?.title).toBe("新對話");
    }
  });
});

describe("deleteConversation (E03-S025)", () => {
  it("removes an existing conversation from the store", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const deleted = await deleteConversation(created.value.id);
    expect(deleted.ok).toBe(true);

    const reloaded = await getConversation(created.value.id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value).toBeNull();
    }
  });

  it("fails closed with NOT_FOUND for an id that doesn't exist, rather than silently no-op-ing", async () => {
    const result = await deleteConversation(NONEXISTENT_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("a second delete of the same (already-deleted) id fails closed with NOT_FOUND — no undefined duplicate side effect", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = await deleteConversation(created.value.id);
    expect(first.ok).toBe(true);

    const second = await deleteConversation(created.value.id);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("NOT_FOUND");
    }
  });

  it("does not affect other conversations", async () => {
    const a = await createConversation();
    const b = await createConversation();
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    await deleteConversation(a.value.id);

    const reloadedB = await getConversation(b.value.id);
    expect(reloadedB.ok).toBe(true);
    if (reloadedB.ok) {
      expect(reloadedB.value?.id).toBe(b.value.id);
    }
  });

  it("a deleted conversation no longer appears in listConversations", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await deleteConversation(created.value.id);

    const list = await listConversations();
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.items.some((item) => item.id === created.value.id)).toBe(false);
    }
  });
});

describe("archiveConversation / unarchiveConversation (E03-S026)", () => {
  it("archiveConversation marks an existing conversation as archived", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.archived ?? false).toBe(false);

    const archived = await archiveConversation(created.value.id);
    expect(archived.ok).toBe(true);
    if (archived.ok) {
      expect(archived.value.archived).toBe(true);
    }

    const reloaded = await getConversation(created.value.id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value?.archived).toBe(true);
    }
  });

  it("unarchiveConversation reverses a previous archive", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await archiveConversation(created.value.id);

    const unarchived = await unarchiveConversation(created.value.id);
    expect(unarchived.ok).toBe(true);
    if (unarchived.ok) {
      expect(unarchived.value.archived).toBe(false);
    }

    const reloaded = await getConversation(created.value.id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value?.archived).toBe(false);
    }
  });

  it("archiveConversation fails closed with NOT_FOUND for an id that doesn't exist", async () => {
    const result = await archiveConversation(NONEXISTENT_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("unarchiveConversation fails closed with NOT_FOUND for an id that doesn't exist", async () => {
    const result = await unarchiveConversation(NONEXISTENT_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("archiving an already-archived conversation succeeds again (idempotent, not a stacking error)", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await archiveConversation(created.value.id);

    const archivedAgain = await archiveConversation(created.value.id);

    expect(archivedAgain.ok).toBe(true);
    if (archivedAgain.ok) {
      expect(archivedAgain.value.archived).toBe(true);
    }
  });

  it("archiving one conversation does not affect another", async () => {
    const a = await createConversation();
    const b = await createConversation();
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    await archiveConversation(a.value.id);

    const reloadedB = await getConversation(b.value.id);
    expect(reloadedB.ok).toBe(true);
    if (reloadedB.ok) {
      expect(reloadedB.value?.archived ?? false).toBe(false);
    }
  });

  it("does not affect a conversation's title, mode, knowledge scopes, or model", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const archived = await archiveConversation(created.value.id);
    expect(archived.ok).toBe(true);
    if (archived.ok) {
      expect(archived.value.title).toBe(created.value.title);
      expect(archived.value.mode).toBe(created.value.mode);
      expect(archived.value.knowledgeScopes).toEqual(created.value.knowledgeScopes);
      expect(archived.value.model).toBe(created.value.model);
    }
  });
});

describe("listConversations archived view (E03-S026)", () => {
  it("defaults to the active (non-archived) view — an archived conversation does not appear", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await archiveConversation(created.value.id);

    const list = await listConversations();
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.items.some((item) => item.id === created.value.id)).toBe(false);
    }
  });

  it("archived=true shows only the archived conversation, not an unarchived one", async () => {
    const archivedOne = await createConversation();
    const activeOne = await createConversation();
    expect(archivedOne.ok && activeOne.ok).toBe(true);
    if (!archivedOne.ok || !activeOne.ok) return;
    await archiveConversation(archivedOne.value.id);

    const list = await listConversations(1, "", true);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.items.some((item) => item.id === archivedOne.value.id)).toBe(true);
      expect(list.value.items.some((item) => item.id === activeOne.value.id)).toBe(false);
    }
  });

  it("unarchiving removes a conversation from the archived view again", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await archiveConversation(created.value.id);
    await unarchiveConversation(created.value.id);

    const archivedList = await listConversations(1, "", true);
    expect(archivedList.ok).toBe(true);
    if (archivedList.ok) {
      expect(archivedList.value.items.some((item) => item.id === created.value.id)).toBe(false);
    }

    const activeList = await listConversations(1, "", false);
    expect(activeList.ok).toBe(true);
    if (activeList.ok) {
      expect(activeList.value.items.some((item) => item.id === created.value.id)).toBe(true);
    }
  });
});

describe("getRecentConversations archived exclusion (E03-S026)", () => {
  it("excludes an archived conversation even though it was just created (and would otherwise be most recent)", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await archiveConversation(created.value.id);

    const recent = await getRecentConversations();
    expect(recent.ok).toBe(true);
    if (recent.ok) {
      expect(recent.value.some((item) => item.id === created.value.id)).toBe(false);
    }
  });
});

describe("listActiveConversations (ux/enterprise-polish sidebar history)", () => {
  it("returns every unarchived conversation without pagination", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await listActiveConversations();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(CONVERSATIONS_PAGE_SIZE);
      expect(result.value.some((item) => item.id === created.value.id)).toBe(true);
    }
  });

  it("excludes an archived conversation", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await archiveConversation(created.value.id);

    const result = await listActiveConversations();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.some((item) => item.id === created.value.id)).toBe(false);
    }
  });

  it("sorts by lastMessageAt descending — the most recently touched conversation comes first", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await listActiveConversations();

    expect(result.ok).toBe(true);
    if (result.ok) {
      const timestamps = result.value.map((item) => item.lastMessageAt);
      const sorted = [...timestamps].sort((a, b) => b.localeCompare(a));
      expect(timestamps).toEqual(sorted);
      expect(result.value[0]?.id).toBe(created.value.id);
    }
  });
});

describe("error mapping (E03-S036 AC2) — call sites' existing error rendering is unchanged, since it only ever branches on error.code", () => {
  it("maps a 403 from the server to ok:false PERMISSION_DENIED", async () => {
    failNextRequest("PERMISSION_DENIED");

    const result = await listConversations();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PERMISSION_DENIED");
  });

  it("maps a 500 from the server to ok:false with a real failure code (not silently treated as empty/success)", async () => {
    failNextRequest("INTERNAL_ERROR");

    const result = await listConversations();

    expect(result.ok).toBe(false);
  });

  it("maps a network failure to ok:false SERVICE_UNAVAILABLE", async () => {
    failNextRequestWithNetworkError();

    const result = await listConversations();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("getConversation also maps a 403 to ok:false PERMISSION_DENIED (not folded into null, unlike a real 404)", async () => {
    failNextRequest("PERMISSION_DENIED");

    const result = await getConversation(NONEXISTENT_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PERMISSION_DENIED");
  });

  it("a mutation (renameConversation) also maps a 403 from the server to ok:false PERMISSION_DENIED", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    failNextRequest("PERMISSION_DENIED");

    const result = await renameConversation(created.value.id, "新標題");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PERMISSION_DENIED");
  });
});
