import { describe, expect, it } from "vitest";
import { createConversation, getRecentConversations, listConversations } from "./conversations";

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
});
