import { describe, expect, it } from "vitest";
import { expectResponseMatchesContract, loadConversationsContract } from "./contract-check.js";

describe("loadConversationsContract / expectResponseMatchesContract (harness self-test)", () => {
  it("loads the real frozen contract and finds the Conversation schema", async () => {
    const registry = await loadConversationsContract();
    expect(() =>
      expectResponseMatchesContract(
        registry,
        "/conversations",
        "post",
        201,
        {
          id: "8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77",
          title: "新對話",
          mode: "normal",
          knowledgeScopes: [],
          model: "standard",
          archived: false,
          lastMessageAt: "2026-08-28T05:00:00.000Z",
          lastMessagePreview: "尚無訊息。",
          createdAt: "2026-08-28T05:00:00.000Z",
          updatedAt: "2026-08-28T05:00:00.000Z",
        },
      ),
    ).not.toThrow();
  });

  it("throws when the body is missing a required field", async () => {
    const registry = await loadConversationsContract();
    expect(() =>
      expectResponseMatchesContract(registry, "/conversations", "post", 201, { title: "x" }),
    ).toThrow();
  });

  it("throws when the body carries a field the contract does not declare", async () => {
    const registry = await loadConversationsContract();
    expect(() =>
      expectResponseMatchesContract(registry, "/conversations", "post", 201, {
        id: "8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77",
        title: "新對話",
        mode: "normal",
        knowledgeScopes: [],
        model: "standard",
        archived: false,
        lastMessageAt: "2026-08-28T05:00:00.000Z",
        lastMessagePreview: "尚無訊息。",
        createdAt: "2026-08-28T05:00:00.000Z",
        updatedAt: "2026-08-28T05:00:00.000Z",
        ownerKey: "leaked",
      }),
    ).toThrow();
  });
});
