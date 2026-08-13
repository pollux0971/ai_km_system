import { describe, expect, it } from "vitest";
import {
  createConversation,
  getConversation,
  getRecentConversations,
  listConversations,
  setConversationKnowledgeScopes,
  setConversationMode,
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
  it("resolves with a non-empty list sharing the same shape as getRecentConversations", async () => {
    const result = await listConversations();

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

  it("grows by exactly one after createConversation()", async () => {
    const before = await listConversations();
    expect(before.ok).toBe(true);
    const countBefore = before.ok ? before.value.length : -1;

    await createConversation();

    const after = await listConversations();
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.value.length).toBe(countBefore + 1);
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
      expect(list.value[0]).toEqual(created.value);
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
