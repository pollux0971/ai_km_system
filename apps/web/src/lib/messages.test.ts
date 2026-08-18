import { describe, expect, it } from "vitest";
import { createConversation, getConversation } from "./conversations";
import {
  deleteMessagesForConversation,
  listMessages,
  MAX_FEEDBACK_COMMENT_LENGTH,
  receiveAssistantReply,
  reviseMessage,
  sendMessage,
  submitAnswerFeedback,
  submitCitationFeedback,
  submitFeedbackComment,
  submitFeedbackReason,
} from "./messages";

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

  it("E03-S021: defaults to state ANSWERED when not specified", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const result = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state).toBe("ANSWERED");
    }
  });

  it("E03-S021: persists an explicitly given state", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const result = await receiveAssistantReply(conversation.value.id, "查無依據的模擬回覆", "NO_EVIDENCE");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state).toBe("NO_EVIDENCE");
    }
  });
});

describe("reviseMessage (E03-S020)", () => {
  it("replaces the content and keeps the id, conversationId, and createdAt unchanged", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const original = await receiveAssistantReply(conversation.value.id, "舊的回覆");
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    const revised = await reviseMessage(original.value.id, "新的回覆");

    expect(revised.ok).toBe(true);
    if (revised.ok) {
      expect(revised.value.content).toBe("新的回覆");
      expect(revised.value.id).toBe(original.value.id);
      expect(revised.value.conversationId).toBe(original.value.conversationId);
      expect(revised.value.createdAt).toBe(original.value.createdAt);
    }
  });

  it("E03-S021: defaults to state ANSWERED when not specified", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const original = await receiveAssistantReply(conversation.value.id, "舊的回覆", "ERROR");
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    const revised = await reviseMessage(original.value.id, "新的回覆");

    expect(revised.ok).toBe(true);
    if (revised.ok) {
      expect(revised.value.state).toBe("ANSWERED");
    }
  });

  it("E03-S021: persists an explicitly given state, overwriting whatever state the message had before", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const original = await receiveAssistantReply(conversation.value.id, "舊的回覆", "ANSWERED");
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    const revised = await reviseMessage(original.value.id, "新的回覆", "PERMISSION_DENIED");

    expect(revised.ok).toBe(true);
    if (revised.ok) {
      expect(revised.value.state).toBe("PERMISSION_DENIED");
    }
  });

  it("retains the replaced content in revisions, rather than discarding it", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const original = await receiveAssistantReply(conversation.value.id, "舊的回覆");
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    const revised = await reviseMessage(original.value.id, "新的回覆");

    expect(revised.ok).toBe(true);
    if (revised.ok) {
      expect(revised.value.revisions).toEqual(["舊的回覆"]);
    }
  });

  it("accumulates multiple revisions in order across successive calls", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const original = await receiveAssistantReply(conversation.value.id, "版本一");
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    await reviseMessage(original.value.id, "版本二");
    const third = await reviseMessage(original.value.id, "版本三");

    expect(third.ok).toBe(true);
    if (third.ok) {
      expect(third.value.content).toBe("版本三");
      expect(third.value.revisions).toEqual(["版本一", "版本二"]);
    }
  });

  it("is reflected in listMessages — the row is updated in place, not duplicated", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const original = await receiveAssistantReply(conversation.value.id, "舊的回覆");
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    await reviseMessage(original.value.id, "新的回覆");

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toHaveLength(1);
      expect(list.value[0]?.content).toBe("新的回覆");
    }
  });

  it("does not affect other messages in the same conversation", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const kept = await sendMessage(conversation.value.id, "保留這則", []);
    const toRevise = await receiveAssistantReply(conversation.value.id, "修訂這則");
    expect(kept.ok && toRevise.ok).toBe(true);
    if (!kept.ok || !toRevise.ok) return;

    await reviseMessage(toRevise.value.id, "修訂後的內容");

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === kept.value.id)?.content).toBe("保留這則");
    }
  });

  it("fails closed with NOT_FOUND when the given id doesn't exist", async () => {
    const result = await reviseMessage("does-not-exist", "新的回覆");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("updates the conversation's lastMessagePreview to reflect the revised content", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const original = await receiveAssistantReply(conversation.value.id, "舊的回覆");
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    await reviseMessage(original.value.id, "新的回覆");

    const reloaded = await getConversation(conversation.value.id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value?.lastMessagePreview).toBe("新的回覆");
    }
  });
});

describe("deleteMessagesForConversation (E03-S025)", () => {
  it("removes all messages belonging to the given conversation", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    await sendMessage(conversation.value.id, "第一則", []);
    await receiveAssistantReply(conversation.value.id, "第二則");

    const deleted = await deleteMessagesForConversation(conversation.value.id);
    expect(deleted.ok).toBe(true);

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toEqual([]);
    }
  });

  it("does not affect messages belonging to other conversations", async () => {
    const a = await createConversation();
    const b = await createConversation();
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    await sendMessage(a.value.id, "屬於 A", []);
    await sendMessage(b.value.id, "屬於 B", []);

    await deleteMessagesForConversation(a.value.id);

    const listB = await listMessages(b.value.id);
    expect(listB.ok).toBe(true);
    if (listB.ok) {
      expect(listB.value.map((m) => m.content)).toEqual(["屬於 B"]);
    }
  });

  it("does not throw or fail for a conversation that has no messages", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const result = await deleteMessagesForConversation(conversation.value.id);

    expect(result.ok).toBe(true);
  });

  it("does not throw or fail for a conversationId that doesn't exist", async () => {
    const result = await deleteMessagesForConversation("does-not-exist");

    expect(result.ok).toBe(true);
  });
});

describe("submitAnswerFeedback (E13-S001)", () => {
  it("sets feedback to 'OK' on an assistant reply and persists it", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    const result = await submitAnswerFeedback(reply.value.id, "OK");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.feedback).toBe("OK");
      expect(result.value.id).toBe(reply.value.id);
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === reply.value.id)?.feedback).toBe("OK");
    }
  });

  it("fails closed with NOT_FOUND for an id that doesn't exist", async () => {
    const result = await submitAnswerFeedback("does-not-exist", "OK");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("fails closed with VALIDATION_ERROR when the target message is a user message, not an assistant reply, and does not set feedback", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const userMessage = await sendMessage(conversation.value.id, "保固期限是多久？", []);
    expect(userMessage.ok).toBe(true);
    if (!userMessage.ok) return;

    const result = await submitAnswerFeedback(userMessage.value.id, "OK");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === userMessage.value.id)?.feedback).toBeUndefined();
    }
  });

  it("is idempotent — submitting the same verdict twice does not create a duplicate record or change the outcome", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    await submitAnswerFeedback(reply.value.id, "OK");
    const second = await submitAnswerFeedback(reply.value.id, "OK");

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.feedback).toBe("OK");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toHaveLength(1);
      expect(list.value[0]?.feedback).toBe("OK");
    }
  });

  it("does not affect other messages' feedback", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const first = await receiveAssistantReply(conversation.value.id, "第一則回覆");
    const second = await receiveAssistantReply(conversation.value.id, "第二則回覆");
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    await submitAnswerFeedback(first.value.id, "OK");

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === second.value.id)?.feedback).toBeUndefined();
    }
  });

  it("is reflected in listMessages — the row is updated in place, not duplicated", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    await submitAnswerFeedback(reply.value.id, "OK");

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toHaveLength(1);
      expect(list.value[0]?.content).toBe("這是模擬回覆內容。");
    }
  });
});

describe("submitAnswerFeedback NG verdict (E13-S002)", () => {
  it("sets feedback to 'NG' on an assistant reply and persists it", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    const result = await submitAnswerFeedback(reply.value.id, "NG");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.feedback).toBe("NG");
      expect(result.value.id).toBe(reply.value.id);
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === reply.value.id)?.feedback).toBe("NG");
    }
  });

  it("fails closed with NOT_FOUND for an id that doesn't exist, same as the OK verdict path", async () => {
    const result = await submitAnswerFeedback("does-not-exist", "NG");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("fails closed with VALIDATION_ERROR when the target is a user message, not an assistant reply", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const userMessage = await sendMessage(conversation.value.id, "保固期限是多久？", []);
    expect(userMessage.ok).toBe(true);
    if (!userMessage.ok) return;

    const result = await submitAnswerFeedback(userMessage.value.id, "NG");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("is idempotent — submitting NG twice does not create a duplicate record or change the outcome", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    await submitAnswerFeedback(reply.value.id, "NG");
    const second = await submitAnswerFeedback(reply.value.id, "NG");

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.feedback).toBe("NG");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toHaveLength(1);
      expect(list.value[0]?.feedback).toBe("NG");
    }
  });

  it("upserts the same row when switching verdicts — the store never accumulates more than one feedback record per message", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    await submitAnswerFeedback(reply.value.id, "OK");
    const switched = await submitAnswerFeedback(reply.value.id, "NG");

    expect(switched.ok).toBe(true);
    if (switched.ok) {
      expect(switched.value.feedback).toBe("NG");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toHaveLength(1);
      expect(list.value[0]?.feedback).toBe("NG");
    }
  });
});

describe("submitFeedbackReason (E13-S003)", () => {
  it("sets feedbackReason on a message that already has NG feedback and persists it", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    await submitAnswerFeedback(reply.value.id, "NG");

    const result = await submitFeedbackReason(reply.value.id, "INCORRECT");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.feedbackReason).toBe("INCORRECT");
      expect(result.value.feedback).toBe("NG");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === reply.value.id)?.feedbackReason).toBe("INCORRECT");
    }
  });

  it("fails closed with NOT_FOUND for an id that doesn't exist", async () => {
    const result = await submitFeedbackReason("does-not-exist", "INCORRECT");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("fails closed with VALIDATION_ERROR when no feedback has been given yet, and does not set feedbackReason", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    const result = await submitFeedbackReason(reply.value.id, "INCORRECT");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === reply.value.id)?.feedbackReason).toBeUndefined();
    }
  });

  it("fails closed with VALIDATION_ERROR when OK (not NG) feedback was given, and does not set feedbackReason", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    await submitAnswerFeedback(reply.value.id, "OK");

    const result = await submitFeedbackReason(reply.value.id, "INCORRECT");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === reply.value.id)?.feedbackReason).toBeUndefined();
    }
  });

  it("is idempotent — submitting the same reason twice does not create a duplicate record or change the outcome", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    await submitAnswerFeedback(reply.value.id, "NG");

    await submitFeedbackReason(reply.value.id, "INCOMPLETE");
    const second = await submitFeedbackReason(reply.value.id, "INCOMPLETE");

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.feedbackReason).toBe("INCOMPLETE");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toHaveLength(1);
      expect(list.value[0]?.feedbackReason).toBe("INCOMPLETE");
    }
  });

  it("upserts the same row when switching reasons — the store never accumulates more than one reason record per message", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    await submitAnswerFeedback(reply.value.id, "NG");

    await submitFeedbackReason(reply.value.id, "INCOMPLETE");
    const switched = await submitFeedbackReason(reply.value.id, "OFF_TOPIC");

    expect(switched.ok).toBe(true);
    if (switched.ok) {
      expect(switched.value.feedbackReason).toBe("OFF_TOPIC");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toHaveLength(1);
      expect(list.value[0]?.feedbackReason).toBe("OFF_TOPIC");
    }
  });

  it("does not affect other messages' feedbackReason", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const first = await receiveAssistantReply(conversation.value.id, "第一則回覆");
    const second = await receiveAssistantReply(conversation.value.id, "第二則回覆");
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    await submitAnswerFeedback(first.value.id, "NG");
    await submitAnswerFeedback(second.value.id, "NG");
    await submitFeedbackReason(first.value.id, "INCORRECT");

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === second.value.id)?.feedbackReason).toBeUndefined();
    }
  });
});

describe("submitFeedbackComment (E13-S004)", () => {
  it("sets feedbackComment on a message that already has OK feedback and persists it", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    await submitAnswerFeedback(reply.value.id, "OK");

    const result = await submitFeedbackComment(reply.value.id, "這個答案特別有幫助，因為引用了正確的政策條文。");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.feedbackComment).toBe("這個答案特別有幫助，因為引用了正確的政策條文。");
      expect(result.value.feedback).toBe("OK");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === reply.value.id)?.feedbackComment).toBe(
        "這個答案特別有幫助，因為引用了正確的政策條文。",
      );
    }
  });

  it("sets feedbackComment on a message that already has NG feedback and persists it alongside an existing reason", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    await submitAnswerFeedback(reply.value.id, "NG");
    await submitFeedbackReason(reply.value.id, "INCORRECT");

    const result = await submitFeedbackComment(reply.value.id, "引用的條文其實是舊版，已經在三月更新過了。");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.feedbackComment).toBe("引用的條文其實是舊版，已經在三月更新過了。");
      expect(result.value.feedbackReason).toBe("INCORRECT");
      expect(result.value.feedback).toBe("NG");
    }
  });

  it("fails closed with NOT_FOUND for an id that doesn't exist", async () => {
    const result = await submitFeedbackComment("does-not-exist", "任何內容");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("fails closed with VALIDATION_ERROR when no feedback has been given yet, and does not set feedbackComment", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    const result = await submitFeedbackComment(reply.value.id, "任何內容");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === reply.value.id)?.feedbackComment).toBeUndefined();
    }
  });

  it("fails closed with VALIDATION_ERROR for an empty comment, and does not set feedbackComment", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    await submitAnswerFeedback(reply.value.id, "OK");

    const result = await submitFeedbackComment(reply.value.id, "");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === reply.value.id)?.feedbackComment).toBeUndefined();
    }
  });

  it("fails closed with VALIDATION_ERROR for a whitespace-only comment, and does not set feedbackComment", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    await submitAnswerFeedback(reply.value.id, "OK");

    const result = await submitFeedbackComment(reply.value.id, "   \n\t  ");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("fails closed with VALIDATION_ERROR when the comment exceeds MAX_FEEDBACK_COMMENT_LENGTH, and does not set feedbackComment", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    await submitAnswerFeedback(reply.value.id, "OK");

    const tooLong = "a".repeat(MAX_FEEDBACK_COMMENT_LENGTH + 1);
    const result = await submitFeedbackComment(reply.value.id, tooLong);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === reply.value.id)?.feedbackComment).toBeUndefined();
    }
  });

  it("accepts a comment exactly at MAX_FEEDBACK_COMMENT_LENGTH", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    await submitAnswerFeedback(reply.value.id, "OK");

    const exactly = "a".repeat(MAX_FEEDBACK_COMMENT_LENGTH);
    const result = await submitFeedbackComment(reply.value.id, exactly);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.feedbackComment).toBe(exactly);
    }
  });

  it("trims leading and trailing whitespace before storing", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    await submitAnswerFeedback(reply.value.id, "OK");

    const result = await submitFeedbackComment(reply.value.id, "  中間有內容前後有空白  ");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.feedbackComment).toBe("中間有內容前後有空白");
    }
  });

  it("is idempotent — submitting the same comment twice does not create a duplicate record or change the outcome", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    await submitAnswerFeedback(reply.value.id, "OK");

    await submitFeedbackComment(reply.value.id, "第一次送出的內容");
    const second = await submitFeedbackComment(reply.value.id, "第一次送出的內容");

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.feedbackComment).toBe("第一次送出的內容");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toHaveLength(1);
      expect(list.value[0]?.feedbackComment).toBe("第一次送出的內容");
    }
  });

  it("upserts the same row when re-submitting a different comment — the store never accumulates more than one comment record per message", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "這是模擬回覆內容。");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    await submitAnswerFeedback(reply.value.id, "OK");

    await submitFeedbackComment(reply.value.id, "第一版留言");
    const revised = await submitFeedbackComment(reply.value.id, "修改後的留言");

    expect(revised.ok).toBe(true);
    if (revised.ok) {
      expect(revised.value.feedbackComment).toBe("修改後的留言");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toHaveLength(1);
      expect(list.value[0]?.feedbackComment).toBe("修改後的留言");
    }
  });

  it("does not affect other messages' feedbackComment", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const first = await receiveAssistantReply(conversation.value.id, "第一則回覆");
    const second = await receiveAssistantReply(conversation.value.id, "第二則回覆");
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    await submitAnswerFeedback(first.value.id, "OK");
    await submitAnswerFeedback(second.value.id, "OK");
    await submitFeedbackComment(first.value.id, "只給第一則的留言");

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === second.value.id)?.feedbackComment).toBeUndefined();
    }
  });
});

describe("submitCitationFeedback (E13-S005)", () => {
  it("sets citationFeedback['1'] to 'OK' on an assistant reply containing a [1] marker, and persists it", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "本季成長 12%[1]");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    const result = await submitCitationFeedback(reply.value.id, "1", "OK");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.citationFeedback).toEqual({ "1": "OK" });
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === reply.value.id)?.citationFeedback).toEqual({ "1": "OK" });
    }
  });

  it("sets citationFeedback['1'] to 'NG' just as validly as 'OK'", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "本季成長 12%[1]");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    const result = await submitCitationFeedback(reply.value.id, "1", "NG");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.citationFeedback).toEqual({ "1": "NG" });
    }
  });

  it("fails closed with NOT_FOUND for a messageId that doesn't exist", async () => {
    const result = await submitCitationFeedback("does-not-exist", "1", "OK");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("fails closed with VALIDATION_ERROR when the target message is a user message, not an assistant reply, and does not set citationFeedback", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const userMessage = await sendMessage(conversation.value.id, "請看附錄 [1] 的說明", []);
    expect(userMessage.ok).toBe(true);
    if (!userMessage.ok) return;

    const result = await submitCitationFeedback(userMessage.value.id, "1", "OK");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === userMessage.value.id)?.citationFeedback).toBeUndefined();
    }
  });

  it("fails closed with VALIDATION_ERROR for a citationId that isn't actually present in the message's content, and does not set citationFeedback", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "本季成長 12%[1]");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    const result = await submitCitationFeedback(reply.value.id, "99", "OK");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === reply.value.id)?.citationFeedback).toBeUndefined();
    }
  });

  it("is idempotent — submitting the same verdict for the same citation twice does not create a duplicate record or change the outcome", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "本季成長 12%[1]");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    await submitCitationFeedback(reply.value.id, "1", "OK");
    const second = await submitCitationFeedback(reply.value.id, "1", "OK");

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.citationFeedback).toEqual({ "1": "OK" });
    }

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toHaveLength(1);
      expect(list.value.find((m) => m.id === reply.value.id)?.citationFeedback).toEqual({ "1": "OK" });
    }
  });

  it("scopes feedback to only the targeted citationId — giving feedback on citation [1] does not affect citation [2] within the SAME message", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "本季成長 12%[1]，去年為 8%[2]");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    const result = await submitCitationFeedback(reply.value.id, "1", "NG");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.citationFeedback).toEqual({ "1": "NG" });
      expect(result.value.citationFeedback?.["2"]).toBeUndefined();
    }
  });

  it("allows giving independent feedback to two different citations within the same message, without either overwriting the other", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "本季成長 12%[1]，去年為 8%[2]");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    await submitCitationFeedback(reply.value.id, "1", "OK");
    const second = await submitCitationFeedback(reply.value.id, "2", "NG");

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.citationFeedback).toEqual({ "1": "OK", "2": "NG" });
    }
  });

  it("does not affect a different message's citationFeedback", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const first = await receiveAssistantReply(conversation.value.id, "第一則回覆[1]");
    const second = await receiveAssistantReply(conversation.value.id, "第二則回覆[1]");
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    await submitCitationFeedback(first.value.id, "1", "OK");

    const list = await listMessages(conversation.value.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((m) => m.id === second.value.id)?.citationFeedback).toBeUndefined();
    }
  });

  it("allows switching a citation's verdict from OK to NG at the data layer (message-thread.tsx's UI is what enforces no-undo)", async () => {
    const conversation = await createConversation();
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    const reply = await receiveAssistantReply(conversation.value.id, "本季成長 12%[1]");
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    await submitCitationFeedback(reply.value.id, "1", "OK");
    const second = await submitCitationFeedback(reply.value.id, "1", "NG");

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.citationFeedback).toEqual({ "1": "NG" });
    }
  });
});
