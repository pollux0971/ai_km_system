import { describe, expect, it } from "vitest";
import { getNotifications } from "./notifications";

describe("getNotifications", () => {
  it("resolves with a non-empty list containing both read and unread items", async () => {
    const result = await getNotifications();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value.some((n) => !n.read)).toBe(true);
      expect(result.value.some((n) => n.read)).toBe(true);
      for (const item of result.value) {
        expect(item.id).toBeTruthy();
        expect(item.title).toBeTruthy();
        expect(item.createdAt).toBeTruthy();
        expect(typeof item.read).toBe("boolean");
      }
    }
  });
});
