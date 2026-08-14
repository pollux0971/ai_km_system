import { describe, expect, it } from "vitest";
import { createConversation, getConversation } from "./conversations";
import { deleteMessage, listMessages, receiveAssistantReply, sendMessage } from "./messages";

describe("listMessages (E03-S009)", () => {
  it("resolves with an empty list for a conversation with no messages", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const result = await listMessages(conversation.value.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it("only returns messages belonging to the given conversation", async () => {
    const a = await createConversation();
    const b = await createConversation();
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    await sendMessage(a.value.id, "訊息 A", []);
    await sendMessage(b.value.id, "訊息 B", []);

    const resultA = await listMessages(a.value.id);
    expect(resultA.ok).toBe(true);
    if (resultA.ok) {
      expect(resultA.value.map((m) => m.content)).toEqual(["訊息 A"]);
    }
  });
});

describe("sendMessage (E03-S009)", () => {
  it("creates a message with role 'user' and persists it", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const result = await sendMessage(conversation.value.id, "你好", []);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.role).toBe("user");
      expect(result.value.content).toBe("你好");
      expect(result.value.conversationId).toBe(conversation.value.id);
      expect(result.value.id).toBeTruthy();
      expect(result.value.createdAt).toBeTruthy();
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok && result.ok) {
      expect(list.value).toContainEqual(result.value);
    }
  });

  it("persists attachment names alongside the message", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const result = await sendMessage(conversation.value.id, "報表如附件", ["Q3.pdf", "chart.png"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.attachmentNames).toEqual(["Q3.pdf", "chart.png"]);
    }
  });

  it("fails closed with NOT_FOUND for an id that doesn't exist, rather than silently no-op-ing", async () => {
    const result = await sendMessage("does-not-exist", "你好", []);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("updates the conversation's lastMessageAt/lastMessagePreview to reflect the sent message", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;
    expect(conversation.value.lastMessagePreview).toBe("尚無訊息。");

    const sent = await sendMessage(conversation.value.id, "保固期限是多久？", []);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const reloaded = await getConversation(conversation.value.id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value?.lastMessagePreview).toBe("保固期限是多久？");
      expect(reloaded.value?.lastMessageAt).toBe(sent.value.createdAt);
    }
  });

  it("uses an attachment-count placeholder preview for an attachment-only message (no text)", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    await sendMessage(conversation.value.id, "", ["photo.png"]);

    const reloaded = await getConversation(conversation.value.id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value?.lastMessagePreview).toBe("已傳送 1 個附件");
    }
  });

  it("generates a unique id for each message", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const a = await sendMessage(conversation.value.id, "第一則", []);
    const b = await sendMessage(conversation.value.id, "第二則", []);

    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value.id).not.toBe(b.value.id);
    }
  });
});

describe("receiveAssistantReply (E03-S010)", () => {
  it("creates a message with role 'assistant' and no attachments, and persists it", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const result = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.role).toBe("assistant");
      expect(result.value.content).toBe("這是模擬回覆內容。");
      expect(result.value.attachmentNames).toEqual([]);
      expect(result.value.conversationId).toBe(conversation.value.id);
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok && result.ok) {
      expect(list.value).toContainEqual(result.value);
    }
  });

  it("fails closed with NOT_FOUND for an id that doesn't exist", async () => {
    const result = await receiveAssistantReply("does-not-exist", "這是模擬回覆內容。");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("updates the conversation's lastMessageAt/lastMessagePreview to reflect the reply", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const received = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(received.ok).toBe(true);
    if (!received.ok) return;

    const reloaded = await getConversation(conversation.value.id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value?.lastMessagePreview).toBe("這是模擬回覆內容。");
      expect(reloaded.value?.lastMessageAt).toBe(received.value.createdAt);
    }
  });

  it("a user message and an assistant reply for the same conversation both appear in listMessages, in order", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    await sendMessage(conversation.value.id, "保固期限是多久？", []);
    await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.map((m) => m.role)).toEqual(["user", "assistant"]);
    }
  });
});

describe("deleteMessage (E03-S019)", () => {
  it("removes the message with the given id from the store", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const sent = await receiveAssistantReply(conversation.value.id, "舊的回覆");
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const deleted = await deleteMessage(sent.value.id);
    expect(deleted.ok).toBe(true);

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toEqual([]);
    }
  });

  it("does not affect other messages in the same conversation", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const kept = await sendMessage(conversation.value.id, "保留這則", []);
    const toDelete = await receiveAssistantReply(conversation.value.id, "刪除這則");
    expect(kept.ok && toDelete.ok).toBe(true);
    if (!kept.ok || !toDelete.ok) return;

    await deleteMessage(toDelete.value.id);

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.map((m) => m.id)).toEqual([kept.value.id]);
    }
  });

  it("does not throw or fail when the given id doesn't exist", async () => {
    const result = await deleteMessage("does-not-exist");

    expect(result.ok).toBe(true);
  });
});
