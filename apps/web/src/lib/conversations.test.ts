import { describe, expect, it } from "vitest";
import { getRecentConversations } from "./conversations";

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
});
