import { beforeEach, describe, expect, it } from "vitest";
import { createPrompt, listPrompts } from "./prompts";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("listPrompts (E11-S012)", () => {
  it("starts with no prompts — this codebase has no real prompt text to seed from yet", async () => {
    const result = await listPrompts();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });
});

describe("createPrompt (E11-S012)", () => {
  it("creates a new prompt and persists it, visible via a subsequent listPrompts() call", async () => {
    const result = await createPrompt({ name: "客服回覆語氣", content: "請以友善、簡潔的語氣回答客戶問題。" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("客服回覆語氣");
    expect(result.value.content).toBe("請以友善、簡潔的語氣回答客戶問題。");

    const list = await listPrompts();
    if (!list.ok) throw new Error("expected ok");
    expect(list.value.map((prompt) => prompt.name)).toContain("客服回覆語氣");
  });

  it("trims whitespace from both name and content", async () => {
    const result = await createPrompt({ name: "  客服回覆語氣  ", content: "  請以友善的語氣回答。  " });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("客服回覆語氣");
    expect(result.value.content).toBe("請以友善的語氣回答。");
  });

  it("rejects an empty name", async () => {
    const result = await createPrompt({ name: "   ", content: "有效的內容。" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty content", async () => {
    const result = await createPrompt({ name: "有效的名稱", content: "   " });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("does not persist anything when validation fails (no partial side effect)", async () => {
    await createPrompt({ name: "", content: "" });

    const list = await listPrompts();
    if (!list.ok) throw new Error("expected ok");
    expect(list.value).toHaveLength(0);
  });

  it("does not change any existing prompt when a new one is created", async () => {
    await createPrompt({ name: "客服回覆語氣", content: "請以友善的語氣回答。" });
    const before = await listPrompts();
    if (!before.ok) throw new Error("expected ok");

    await createPrompt({ name: "技術支援語氣", content: "請提供具體的排除步驟。" });

    const after = await listPrompts();
    if (!after.ok) throw new Error("expected ok");
    expect(after.value.slice(0, before.value.length)).toEqual(before.value);
  });

  it("gives each newly created prompt its own distinct promptId, even for the same name", async () => {
    const first = await createPrompt({ name: "客服回覆語氣", content: "版本一。" });
    const second = await createPrompt({ name: "客服回覆語氣", content: "版本二。" });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.promptId).not.toBe(second.value.promptId);
  });
});
