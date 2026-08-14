import { describe, expect, it } from "vitest";
import {
  CONVERSATIONS_PAGE_SIZE,
  createConversation,
  getConversation,
  getRecentConversations,
  listConversations,
  setConversationKnowledgeScopes,
  setConversationMode,
  setConversationModel,
} from "./conversations";

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

  it("a page far beyond the last one resolves with an empty items array, not an error", async () => {
    const result = await listConversations(999999);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toEqual([]);
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
    const result = await getConversation("does-not-exist");

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
    const result = await setConversationMode("does-not-exist", "advanced");

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
    const result = await setConversationKnowledgeScopes("does-not-exist", ["company"]);

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
    const result = await setConversationModel("does-not-exist", "advanced-local");

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
