import { beforeEach, describe, expect, it } from "vitest";
import { listFeedbackKnowledgeCandidates, submitFeedbackKnowledgeCandidate } from "./feedback-knowledge-candidates";
import type { Message } from "./messages";

function makeAssistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    conversationId: "c1",
    role: "assistant",
    content: "這是一個示範回答，包含引用 [1]。",
    attachmentNames: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("submitFeedbackKnowledgeCandidate / listFeedbackKnowledgeCandidates (E13-S015)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("returns an empty list before any candidate has been flagged", () => {
    expect(listFeedbackKnowledgeCandidates()).toEqual([]);
  });

  it("flags a qualifying NG+reason+comment message and persists a candidate with the answer/reason/comment", async () => {
    const message = makeAssistantMessage({
      feedback: "NG",
      feedbackReason: "INCORRECT",
      feedbackComment: "引用的條文其實是舊版，已經在三月更新過了。",
    });

    const result = await submitFeedbackKnowledgeCandidate(message);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sourceMessageId).toBe("m1");
      expect(result.value.conversationId).toBe("c1");
      expect(result.value.answerContent).toBe(message.content);
      expect(result.value.reason).toBe("INCORRECT");
      expect(result.value.comment).toBe("引用的條文其實是舊版，已經在三月更新過了。");
      expect(() => new Date(result.value.createdAt).toISOString()).not.toThrow();
    }

    const candidates = listFeedbackKnowledgeCandidates();
    expect(candidates).toHaveLength(1);
  });

  it("fails closed with VALIDATION_ERROR when the message has no feedback at all", async () => {
    const message = makeAssistantMessage();

    const result = await submitFeedbackKnowledgeCandidate(message);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
    expect(listFeedbackKnowledgeCandidates()).toEqual([]);
  });

  it("fails closed with VALIDATION_ERROR for an OK-feedback message, even with a comment", async () => {
    const message = makeAssistantMessage({ feedback: "OK", feedbackComment: "特別有幫助" });

    const result = await submitFeedbackKnowledgeCandidate(message);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
    expect(listFeedbackKnowledgeCandidates()).toEqual([]);
  });

  it("fails closed with VALIDATION_ERROR when NG feedback has no reason yet", async () => {
    const message = makeAssistantMessage({ feedback: "NG", feedbackComment: "有些地方怪怪的" });

    const result = await submitFeedbackKnowledgeCandidate(message);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
    expect(listFeedbackKnowledgeCandidates()).toEqual([]);
  });

  it("fails closed with VALIDATION_ERROR when NG feedback has a reason but no comment yet", async () => {
    const message = makeAssistantMessage({ feedback: "NG", feedbackReason: "INCOMPLETE" });

    const result = await submitFeedbackKnowledgeCandidate(message);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
    expect(listFeedbackKnowledgeCandidates()).toEqual([]);
  });

  it("fails closed with VALIDATION_ERROR when the comment is whitespace-only", async () => {
    const message = makeAssistantMessage({ feedback: "NG", feedbackReason: "OFF_TOPIC", feedbackComment: "   " });

    const result = await submitFeedbackKnowledgeCandidate(message);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
    expect(listFeedbackKnowledgeCandidates()).toEqual([]);
  });

  it("is idempotent — flagging the same message twice returns the same candidate, not a duplicate", async () => {
    const message = makeAssistantMessage({
      feedback: "NG",
      feedbackReason: "OTHER",
      feedbackComment: "答非所問",
    });

    const first = await submitFeedbackKnowledgeCandidate(message);
    const second = await submitFeedbackKnowledgeCandidate(message);

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value.id).toBe(first.value.id);
      expect(second.value.createdAt).toBe(first.value.createdAt);
    }
    expect(listFeedbackKnowledgeCandidates()).toHaveLength(1);
  });

  it("keeps candidates from different messages distinct — flagging one message does not affect another's candidate", async () => {
    const first = makeAssistantMessage({
      id: "m1",
      feedback: "NG",
      feedbackReason: "INCORRECT",
      feedbackComment: "第一則的說明",
    });
    const second = makeAssistantMessage({
      id: "m2",
      feedback: "NG",
      feedbackReason: "INCOMPLETE",
      feedbackComment: "第二則的說明",
    });

    await submitFeedbackKnowledgeCandidate(first);
    await submitFeedbackKnowledgeCandidate(second);

    const candidates = listFeedbackKnowledgeCandidates();
    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.sourceMessageId).sort()).toEqual(["m1", "m2"]);
    expect(candidates.find((candidate) => candidate.sourceMessageId === "m1")?.comment).toBe("第一則的說明");
    expect(candidates.find((candidate) => candidate.sourceMessageId === "m2")?.comment).toBe("第二則的說明");
  });
});
