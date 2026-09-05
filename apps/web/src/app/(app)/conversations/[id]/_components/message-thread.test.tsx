import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MessageThread } from "./message-thread";
import { ANSWER_STATES, ANSWER_STATE_FALLBACK_CONTENT, ANSWER_STATE_LABELS, MOCK_ANSWER_STATE_TRIGGERS } from "@/lib/answer-state";
// Namespace import, kept separate from the named import above and NOT
// mocked (this module already isn't mocked anywhere in this file — see
// the plain-named import right above), purely so vi.spyOn can wrap its
// real resolveAnswerStateDisplay export. See the "resolveAnswerStateDisplay
// wiring" describe block below for why a spy is necessary here at all.
import * as answerStateModule from "@/lib/answer-state";
import { apiClient } from "@/lib/api";
import { ConversationEventsProvider, type ConversationEventSourceLike } from "@/lib/conversation-events-context";
import type { ConnectionStatus, ConversationEvent } from "@/lib/conversation-events";
import { MOCK_FILE_PROCESSING_FAILURE_TRIGGER, simulateFileProcessing } from "@/lib/file-processing";
import { listFeedbackKnowledgeCandidates, submitFeedbackKnowledgeCandidate } from "@/lib/feedback-knowledge-candidates";
import { runGenerationPhases } from "@/lib/generation-status";
import { CurrentUserProvider } from "@/lib/session-context";
import {
  listMessages,
  receiveAssistantReply,
  reviseMessage,
  sendMessage,
  submitAnswerFeedback,
  submitCitationFeedback,
  submitFeedbackComment,
  submitFeedbackReason,
  type AnswerFeedbackVerdict,
  type FeedbackReason,
} from "@/lib/messages";
import { shouldSimulateStreamDisconnect, streamAssistantReply } from "@/lib/streaming";
import { trackEvent } from "@/lib/telemetry";
import { recordUsageEvent } from "@/lib/usage-events";

vi.mock("@/lib/messages", () => ({
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  receiveAssistantReply: vi.fn(),
  reviseMessage: vi.fn(),
  submitAnswerFeedback: vi.fn(),
  submitCitationFeedback: vi.fn(),
  submitFeedbackReason: vi.fn(),
  submitFeedbackComment: vi.fn(),
  // Plain data, not vi.fn() — mirrors this file's established convention
  // (see the generation-status mock's own doc comment) of duplicating
  // inert constant/label values rather than vi.importActual'ing them.
  FEEDBACK_REASONS: ["INCORRECT", "INCOMPLETE", "OFF_TOPIC", "OTHER"],
  FEEDBACK_REASON_LABELS: {
    INCORRECT: "答案不正確",
    INCOMPLETE: "答案不完整",
    OFF_TOPIC: "答案離題",
    OTHER: "其他",
  },
  MAX_FEEDBACK_COMMENT_LENGTH: 500,
}));

vi.mock("@/lib/streaming", () => ({
  streamAssistantReply: vi.fn(),
  // E03-S031: real implementation is `userQuestion.includes(...)` — a
  // pure, deterministic, harmless function, but mocked anyway (not
  // vi.importActual'd) to match this file's established convention of
  // never importing real implementations into its mocks. Every
  // pre-S031 test sends plain trigger-free content, so a default of
  // "never disconnect" keeps them all passing unchanged; the new S031
  // tests below override it explicitly.
  shouldSimulateStreamDisconnect: vi.fn().mockReturnValue(false),
}));

// Same reasoning as the generation-status mock above: a plain
// synchronous factory, value duplicated rather than vi.importActual'd.
// Only simulateFileProcessing (which has a real 800ms default delay)
// needs faking — the trigger string itself is inert data.
vi.mock("@/lib/file-processing", () => ({
  MOCK_FILE_PROCESSING_FAILURE_TRIGGER: "[模擬:PROCESSING_FAILED]",
  simulateFileProcessing: vi.fn(),
}));

// message-thread.tsx only reads GENERATION_PHASE_LABELS (for rendering)
// and runGenerationPhases (to call) from this module — not
// GENERATION_PHASES — so the mock only needs to provide those two.
// Values duplicated (not vi.importActual'd) to keep this a plain
// synchronous factory, matching the other two mocks in this file.
vi.mock("@/lib/generation-status", () => ({
  GENERATION_PHASE_LABELS: {
    searching: "搜尋中…",
    reading: "讀取中…",
    generating: "生成中…",
  },
  runGenerationPhases: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

// E13-S011: importOriginal (not a plain synchronous factory like this
// file's other mocks) so the real, pure `countDistinctCitations` stays
// callable — a full replacement would make it undefined the moment
// message-thread.tsx imports it, same trap E13-S007's EVIDENCE already
// documented for a different module's mock. Only `recordUsageEvent`
// itself needs to be a spy.
vi.mock("@/lib/usage-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/usage-events")>();
  return { ...actual, recordUsageEvent: vi.fn() };
});

vi.mock("@/lib/feedback-knowledge-candidates", () => ({
  submitFeedbackKnowledgeCandidate: vi.fn(),
  listFeedbackKnowledgeCandidates: vi.fn(),
}));

const mockedListMessages = vi.mocked(listMessages);
const mockedSendMessage = vi.mocked(sendMessage);
const mockedReceiveAssistantReply = vi.mocked(receiveAssistantReply);
const mockedReviseMessage = vi.mocked(reviseMessage);
const mockedSubmitAnswerFeedback = vi.mocked(submitAnswerFeedback);
const mockedSubmitCitationFeedback = vi.mocked(submitCitationFeedback);
const mockedSubmitFeedbackReason = vi.mocked(submitFeedbackReason);
const mockedSubmitFeedbackComment = vi.mocked(submitFeedbackComment);
const mockedStreamAssistantReply = vi.mocked(streamAssistantReply);
const mockedShouldSimulateStreamDisconnect = vi.mocked(shouldSimulateStreamDisconnect);
const mockedRunGenerationPhases = vi.mocked(runGenerationPhases);
const mockedTrackEvent = vi.mocked(trackEvent);
const mockedSimulateFileProcessing = vi.mocked(simulateFileProcessing);
const mockedRecordUsageEvent = vi.mocked(recordUsageEvent);
const mockedSubmitFeedbackKnowledgeCandidate = vi.mocked(submitFeedbackKnowledgeCandidate);
const mockedListFeedbackKnowledgeCandidates = vi.mocked(listFeedbackKnowledgeCandidates);

const DEFAULT_ASSISTANT_MESSAGE = {
  id: "assistant-default",
  conversationId: "c1",
  role: "assistant" as const,
  content: "（預設 mock 回覆，與送出測試無關）",
  attachmentNames: [],
  createdAt: "2026-08-14T00:00:00.000Z",
};

beforeEach(() => {
  mockedListMessages.mockReset();
  mockedSendMessage.mockReset();
  mockedReceiveAssistantReply.mockReset();
  mockedReviseMessage.mockReset();
  mockedStreamAssistantReply.mockReset();
  mockedRunGenerationPhases.mockReset();
  mockedTrackEvent.mockReset();
  mockedSimulateFileProcessing.mockReset();
  mockedShouldSimulateStreamDisconnect.mockReset();
  mockedShouldSimulateStreamDisconnect.mockReturnValue(false);

  // Only reached when a submitted message actually has attachments —
  // every pre-S29 test uses submitViaComposer, which never attaches
  // files, so this default only matters for S29's own new tests below
  // (each of which overrides it explicitly anyway); it exists purely
  // so this mock always has SOME implementation rather than throwing
  // "not implemented" if a future test exercises this path without
  // configuring it first.
  mockedSimulateFileProcessing.mockResolvedValue("done");

  // Sensible defaults so tests focused purely on the S09/S10 send/stream
  // flow don't also need to know about S11's phase step — a successful
  // send always triggers streaming, which always runs the phase sequence
  // first, so every mockedSendMessage-succeeds test would otherwise
  // crash on an unmocked/unconfigured phase generator.
  mockedRunGenerationPhases.mockImplementation(async function* () {
    return;
  });
  mockedStreamAssistantReply.mockImplementation(async function* () {
    return;
  });
  mockedReceiveAssistantReply.mockResolvedValue({ ok: true, value: DEFAULT_ASSISTANT_MESSAGE });
  mockedReviseMessage.mockResolvedValue({ ok: true, value: DEFAULT_ASSISTANT_MESSAGE });
  mockedSubmitAnswerFeedback.mockReset();
  mockedSubmitCitationFeedback.mockReset();
  mockedSubmitFeedbackReason.mockReset();
  mockedSubmitFeedbackComment.mockReset();
  mockedRecordUsageEvent.mockReset();
  mockedSubmitFeedbackKnowledgeCandidate.mockReset();
  mockedListFeedbackKnowledgeCandidates.mockReset();
  mockedListFeedbackKnowledgeCandidates.mockReturnValue([]);
});

function submitViaComposer(content: string) {
  fireEvent.change(screen.getByLabelText("訊息"), { target: { value: content } });
  fireEvent.click(screen.getByRole("button", { name: "送出" }));
}

describe("MessageThread (E03-S009)", () => {
  it("shows a loading state before messages resolve", () => {
    mockedListMessages.mockReturnValue(new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows a distinct error state when loading fails", async () => {
    mockedListMessages.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<MessageThread conversationId="c1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入訊息。");
  });

  it("shows an empty state when there are no messages yet", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });

    render(<MessageThread conversationId="c1" />);

    expect(await screen.findByText("尚無訊息，開始對話吧。")).toBeInTheDocument();
  });

  it("shows previously-sent messages once loaded", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "m1",
          conversationId: "c1",
          role: "user",
          content: "保固期限是多久？",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:00.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    expect(await screen.findByText("保固期限是多久？")).toBeInTheDocument();
  });

  it("optimistically shows a message as pending immediately on submit, then reconciles to sent once the refreshed list confirms it", async () => {
    // 11-app-shell/phase-3: a successful send no longer just reconciles
    // the optimistic entry in place — attemptSend also calls
    // refetchAndMergeMessages(), which REPLACES every "sent" entry with
    // whatever listMessages() returns on its NEXT call. A single static
    // mockResolvedValue (the pre-phase-3 shape of this test) would make
    // that refetch clobber "你好" right back out of the DOM with the
    // stale (still-empty) list — this double must itself reflect the
    // send having happened, same as a real server would.
    mockedListMessages.mockResolvedValueOnce({ ok: true, value: [] });
    let resolveSend!: (value: Awaited<ReturnType<typeof sendMessage>>) => void;
    mockedSendMessage.mockReturnValue(new Promise((resolve) => (resolveSend = resolve)));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");

    submitViaComposer("你好");

    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("傳送中…");

    const sentMessage = {
      id: "m1",
      conversationId: "c1",
      role: "user" as const,
      content: "你好",
      attachmentNames: [],
      createdAt: "2026-08-14T00:00:00.000Z",
    };
    mockedListMessages.mockResolvedValueOnce({ ok: true, value: [sentMessage] });
    resolveSend({ ok: true, value: sentMessage });

    await waitFor(() => expect(screen.queryByText("傳送中…")).not.toBeInTheDocument());
    expect(screen.getByText("你好")).toBeInTheDocument();
  });

  it("shows a failed message with a retry action when sending fails, and keeps the content visible", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");

    submitViaComposer("你好");

    expect(await screen.findByText("傳送失敗")).toBeInTheDocument();
    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新傳送" })).toBeInTheDocument();
  });

  it("retrying a failed message re-attempts sendMessage with the same content and can succeed", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValueOnce({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");
    await screen.findByText("傳送失敗");

    mockedSendMessage.mockResolvedValueOnce({
      ok: true,
      value: {
        id: "m1",
        conversationId: "c1",
        role: "user",
        content: "你好",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:00.000Z",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "重新傳送" }));

    await waitFor(() => expect(screen.queryByText("傳送失敗")).not.toBeInTheDocument());
    expect(mockedSendMessage).toHaveBeenCalledTimes(2);
    expect(mockedSendMessage).toHaveBeenNthCalledWith(2, "c1", "你好", []);
  });

  it("calls sendMessage with the conversationId, content, and attachment names from the composer", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({
      ok: true,
      value: {
        id: "m1",
        conversationId: "c1",
        role: "user",
        content: "你好",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:00.000Z",
      },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() => expect(mockedSendMessage).toHaveBeenCalledWith("c1", "你好", []));
  });
});

const SENT_USER_MESSAGE = {
  id: "m1",
  conversationId: "c1",
  role: "user" as const,
  content: "你好",
  attachmentNames: [],
  createdAt: "2026-08-14T00:00:00.000Z",
};

describe("MessageThread streaming assistant reply (E03-S010)", () => {
  // 11-app-shell/phase-3 (ADR 0017 第二步:「apps/web 切到 server 生成,
  // 移除瀏覽器端生成(E03-S010)」——這是這份 ADR 指名要移除的那個故事本身,
  // 不是它剛好用到的某個 mock)。刪掉三條、改寫兩條,理由分開寫清楚:
  //
  // 刪掉(送出這個動作本身觸發本地生成,ADR 0017 指名移除,且不留缺口):
  // - "automatically starts streaming an assistant reply once the user's
  //   message finishes sending" —— 就是 ADR 0017 第二步字面上要移除的
  //   行為(送出後自動在瀏覽器端開始生成),沒有替代場景,因為送出動作本身
  //   已經不再觸發任何本地生成。
  // - "shows a distinct failed state with a retry action when persisting
  //   the reply fails" —— 與下面 E03-S032「retrying a stream-failed
  //   regenerate revises the same original message again」(既有、綠燈)
  //   實質重複:兩者都驗證「持久化失敗 → 顯示 AI 回覆失敗 + 重新產生回覆
  //   按鈕」,只是一個透過送出觸發、一個透過重新產生觸發,而送出已經不會
  //   觸發任何本地串流。
  // - "retrying a failed stream re-attempts streamAssistantReply and can
  //   succeed" —— 同一條 E03-S032 測試的後半段(失敗後重試、第二次成功)
  //   已經覆蓋這個決定性行為(重新呼叫 streamAssistantReply、可以成功),
  //   同樣的重複理由。
  //
  // 改寫(機制本身還活著——runStream/streamAssistantReply/
  // receiveAssistantReply 這些底層函式沒有消失,只是換了觸發的入口,從
  // handleRegenerate 進入,commit message 自己也這樣講:「continue 服務
  // handleRegenerate/handleRetryStream/handleReconnect 三條既有路徑」):
  // 下面兩條改成透過「重新產生」觸發同一段 runStream,斷言內容(逐字累積
  // 的內容、最終持久化的完整字串)一個字不改,只換了進入串流狀態的動作。
  it("shows the reply's content growing as chunks arrive, before a regeneration completes", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "舊的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });

    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "第";
      yield "一";
      await gate;
      yield "段";
    });
    mockedReviseMessage.mockResolvedValue({
      ok: true,
      value: {
        id: "a1",
        conversationId: "c1",
        role: "assistant",
        content: "第一段",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:01.000Z",
        revisions: ["舊的回覆"],
      },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");
    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    await waitFor(() => expect(screen.getByText("第一")).toBeInTheDocument());
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("AI 回覆中…");

    releaseGate();

    // Once the gate releases, the generator yields its last chunk and
    // completes — the locally-accumulated text ("第一段") is what gets
    // persisted, proven directly (not just via what's re-displayed,
    // which depends on the mocked reviseMessage's return value, not on
    // this component's own accumulation). 3rd arg "ANSWERED"
    // (E03-S021): "a1" has no explicit `state`, so handleRegenerate's
    // `originalMessage.state ?? "ANSWERED"` fallback applies.
    await waitFor(() => expect(mockedReviseMessage).toHaveBeenCalledWith("a1", "第一段", "ANSWERED"));
    await waitFor(() => expect(screen.queryByText("AI 回覆中…")).not.toBeInTheDocument());
  });

  it("reconciles a completed regeneration to a sent assistant message and persists the full accumulated content", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "舊的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "第";
      yield "一";
      yield "段";
    });
    mockedReviseMessage.mockResolvedValue({
      ok: true,
      value: {
        id: "a1",
        conversationId: "c1",
        role: "assistant",
        content: "第一段",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:01.000Z",
        revisions: ["舊的回覆"],
      },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");
    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    await waitFor(() => expect(screen.queryByText("AI 回覆中…")).not.toBeInTheDocument());
    expect(screen.getByText("第一段")).toBeInTheDocument();
    // 3rd arg "ANSWERED" (E03-S021): "a1" has no explicit `state`.
    expect(mockedReviseMessage).toHaveBeenCalledWith("a1", "第一段", "ANSWERED");
  });

  it("labels the user's own message and the assistant's reply distinctly", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一段",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    const items = await screen.findAllByRole("listitem");
    expect(items[0]).toHaveTextContent("你");
    expect(items[1]).toHaveTextContent("AI");
  });
});

// 11-app-shell/phase-3 (B 類:改寫,不刪,理由與 E03-S013 相同). phase 顯示
// 是 runStream 開頭那段 `for await (const phase of runGenerationPhases())`
// 的渲染,不管進入這段的動作是送出還是重新產生——送出已經不再觸發它(見
// E03-S010 describe 開頭的說明),下面三條全部改用「重新產生」進入同一段
// runStream,持久化呼叫也對應換成 `reviseMessage`(regenerate 的既有finalize
// 路徑,E03-S020 已確立),斷言內容(phase 出現的順序、AI 回覆中…取代生成中…
// 的時機、重試後 phase 序列重跑)一個字不改。
const EXISTING_ASSISTANT_REPLY_FOR_REGENERATE = {
  id: "a1",
  conversationId: "c1",
  role: "assistant" as const,
  content: "舊的回覆",
  attachmentNames: [],
  createdAt: "2026-08-14T00:00:01.000Z",
};

describe("MessageThread generation status phases (E03-S011)", () => {
  it("shows each phase label in order (searching, then reading, then generating) before any reply text exists", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, EXISTING_ASSISTANT_REPLY_FOR_REGENERATE] });

    let releaseSearching!: () => void;
    let releaseReading!: () => void;
    const searchingGate = new Promise<void>((resolve) => {
      releaseSearching = resolve;
    });
    const readingGate = new Promise<void>((resolve) => {
      releaseReading = resolve;
    });
    mockedRunGenerationPhases.mockImplementation(async function* () {
      yield "searching";
      await searchingGate;
      yield "reading";
      await readingGate;
      yield "generating";
    });
    // Left permanently pending — this test only cares about observing
    // the three phases in order, not what happens after. Without this,
    // once the phase generator exhausts, runStream immediately falls
    // through to the default (instantly-resolving) beforeEach mocks for
    // streamAssistantReply/reviseMessage, and the whole flow races to
    // "sent" before waitFor can reliably catch the brief "generating"
    // window.
    mockedStreamAssistantReply.mockImplementation(async function* () {
      await new Promise<void>(() => {});
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");
    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("搜尋中…"));

    releaseSearching();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("讀取中…"));

    releaseReading();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("生成中…"));
  });

  it("falls back to the generic streaming status once the phase sequence completes and real text starts arriving", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, EXISTING_ASSISTANT_REPLY_FOR_REGENERATE] });
    mockedRunGenerationPhases.mockImplementation(async function* () {
      yield "searching";
      yield "reading";
      yield "generating";
    });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "回覆內容";
    });
    // Left permanently pending — this test checks the "actively
    // streaming text" state specifically. reviseMessage's default
    // (beforeEach) mock resolves near-instantly with unrelated content,
    // which would otherwise race the reconciliation-to-"sent" transition
    // against the synchronous assertions below.
    mockedReviseMessage.mockImplementation(() => new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");
    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    await waitFor(() => expect(screen.getByText("回覆內容")).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("AI 回覆中…");
    expect(screen.queryByText("生成中…")).not.toBeInTheDocument();
  });

  it("runs the phase sequence again on retry after a stream failure", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, EXISTING_ASSISTANT_REPLY_FOR_REGENERATE] });
    mockedReviseMessage.mockResolvedValueOnce({ ok: false, error: { code: "NOT_FOUND", message: "找不到這則訊息。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");
    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));
    await screen.findByText("AI 回覆失敗");

    expect(mockedRunGenerationPhases).toHaveBeenCalledTimes(1);
    mockedReviseMessage.mockResolvedValueOnce({ ok: true, value: { ...EXISTING_ASSISTANT_REPLY_FOR_REGENERATE, revisions: ["舊的回覆"] } });
    fireEvent.click(screen.getByRole("button", { name: "重新產生回覆" }));

    await waitFor(() => expect(mockedRunGenerationPhases).toHaveBeenCalledTimes(2));
  });
});

describe("MessageThread stop generation (E03-S012)", () => {
  // 11-app-shell/phase-3. 刪掉三條(不是改寫)——與 E03-S010/S031 不同,這三條
  // 測的不是「送出這個動作本身觸發了什麼」,而是 runStream 裡一個特定的分支:
  // 沒有 reviseTarget 的串流項目(`stoppedRef` 觸發時 `reviseTarget` 為
  // undefined → 整條移除;有內容則走 receiveAssistantReply 持久化)。
  //
  // 這個分支現在**沒有任何活的入口**可以進去,不是「換個入口就能重現」:
  // - handleRegenerate 呼叫 runStream 永遠帶 `originalMessage` 當
  //   reviseTarget(message-thread.tsx 約 883 行),不可能是 undefined。
  // - handleRetryStream/handleReconnect 的 reviseTarget 來自它們重試的那個
  //   「stream-failed」/「stream-disconnected」項目自己的 `reviseTarget`
  //   欄位——而那個欄位只可能來自當初建立這個串流項目的呼叫,也就是只可能
  //   來自 handleRegenerate(永遠有 reviseTarget)或已移除的送出路徑(不再
  //   存在)。
  // 換句話說,「一個沒有 reviseTarget 的串流項目」這個前提本身,在移除
  // attemptSend 的本地生成之後就不可能再發生——不是這三條測試用錯了觸發
  // 動作,是它們測的那個分支已經是死碼。與 E03-S031(見下)是同一種死碼
  // 判準,但發現路徑不同:S031 是「唯一能設定該旗標的呼叫點消失」,這裡
  // 是「唯一能傳入 undefined reviseTarget 的呼叫路徑消失」。
  it("does not show a stop button once a message has settled (sent, failed, or stream-failed)", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "已完成的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("已完成的回覆");
    expect(screen.queryByRole("button", { name: "停止生成" })).not.toBeInTheDocument();
  });
});

describe("MessageThread citation badges (E03-S013)", () => {
  // 11-app-shell/phase-3: 改寫,不刪——badge 是 message-content.tsx 對
  // 「已結算內容含 [N] 記號」這件事的渲染,與內容怎麼結算出來(送出後的本地
  // 串流,或重新產生)無關。送出已經不再觸發本地串流,改用「重新產生」進入
  // 同一段 runStream,斷言(badge 文字、role)一個字不改。
  it("renders a citation badge once a regenerated reply containing a [N] marker settles", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "舊的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "本季成長 12%[1]";
    });
    mockedReviseMessage.mockResolvedValue({
      ok: true,
      value: {
        id: "a1",
        conversationId: "c1",
        role: "assistant",
        content: "本季成長 12%[1]",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:01.000Z",
        revisions: ["舊的回覆"],
      },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");
    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    await waitFor(() => expect(screen.queryByText("AI 回覆中…")).not.toBeInTheDocument());
    expect(screen.getByText("本季成長 12%")).toBeInTheDocument();
    expect(screen.getByRole("superscript")).toHaveTextContent("[1]");
  });

  it("shows citation badges on previously-sent assistant messages that contain [N] markers", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "已完成的回覆[1]",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    expect(await screen.findByRole("superscript")).toHaveTextContent("[1]");
  });

  it("does not render a citation badge for the user's own message, even if it contains a [N]-shaped substring", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "m1",
          conversationId: "c1",
          role: "user",
          content: "請看附錄 [1] 的說明",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:00.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("請看附錄 [1] 的說明");
    expect(screen.queryByRole("superscript")).not.toBeInTheDocument();
  });
});

// Uses the REAL lib/citations.ts (not mocked) — proving the actual
// wiring end to end (click → state → CitationPreviewDrawer → real
// getCitationSource → real mock data → rendered), consistent with how
// this file already asserts on lib/streaming.ts's real MOCK_REPLY
// elsewhere rather than mocking every layer.
describe("MessageThread citation preview (E03-S014)", () => {
  function assistantMessageWithCitation() {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "已完成的回覆[1]",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
  }

  it("clicking a citation badge opens the preview drawer showing that citation's source", async () => {
    assistantMessageWithCitation();

    render(<MessageThread conversationId="c1" />);
    await screen.findByRole("button", { name: "檢視引用來源 1" });

    expect(screen.queryByRole("region", { name: "引用來源預覽" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "檢視引用來源 1" }));

    expect(await screen.findByRole("region", { name: "引用來源預覽" })).toBeInTheDocument();
    expect(await screen.findByText("（模擬來源文件 1，尚未串接真正的知識庫）")).toBeInTheDocument();
  });

  it("closing the preview drawer removes it from the page", async () => {
    assistantMessageWithCitation();

    render(<MessageThread conversationId="c1" />);
    await screen.findByRole("button", { name: "檢視引用來源 1" });
    fireEvent.click(screen.getByRole("button", { name: "檢視引用來源 1" }));
    await screen.findByRole("region", { name: "引用來源預覽" });

    fireEvent.click(screen.getByRole("button", { name: "關閉" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "引用來源預覽" })).not.toBeInTheDocument());
  });
});

describe("MessageThread multi-turn conversation (E03-S017)", () => {
  it("disables the composer's submit button while a message is pending (send in flight)", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockReturnValue(new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("第一輪");

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("傳送中…"));
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "下一句" } });
    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
  });

  // 11-app-shell/phase-3. 刪掉(不是改寫)——這條測的是「送出觸發的本地串流
  // 期間composer 被鎖住」,但送出已經不再觸發任何本地串流(見 E03-S010 describe
  // 開頭的說明)。「composer 在任何串流期間都鎖住」這個決定性行為並未消失,
  // 只是唯一還能進入串流狀態的動作變成了「重新產生」——而那正是既有、綠燈的
  // E03-S019「locks the composer while a regeneration is in flight, same as
  // any other turn」已經在驗的事,不需要重複一份。
  it("re-enables the composer's submit once the turn fully settles", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "回覆內容";
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("第一輪");

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "第二輪" } });
    expect(screen.getByRole("button", { name: "送出" })).toBeEnabled();
  });

  /**
   * 11-app-shell/phase-3 (顧問裁決,B 類:改寫,不刪). 決定性的量沒有變
   * (四則訊息的順序與角色),變的是資料怎麼進來:改之前靠
   * `streamAssistantReply` 在瀏覽器端逐字產生第二則訊息,改之後每次送出
   * 都由 `refetchAndMergeMessages()` 重抓一次,而伺服器在同一個交易裡
   * 就把使用者訊息與助理回覆一起產生好(見 message-thread.tsx attemptSend
   * 的文件)——所以這裡的替身讓 `listMessages()` 每次送出後多回傳一輪
   * 「使用者訊息+助理回覆」,而不是靠 `streamAssistantReply` 逐字組出來。
   */
  it("sending a second full turn after the first settles shows all four messages in order", async () => {
    const TURN1_USER = { id: "u1", conversationId: "c1", role: "user" as const, content: "第一輪", attachmentNames: [], createdAt: "2026-08-14T00:00:00.000Z" };
    const TURN1_ASSISTANT = { id: "a1", conversationId: "c1", role: "assistant" as const, content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" };
    const TURN2_USER = { id: "u2", conversationId: "c1", role: "user" as const, content: "第二輪", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" };
    const TURN2_ASSISTANT = { id: "a2", conversationId: "c1", role: "assistant" as const, content: "第二輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" };

    mockedListMessages
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockResolvedValueOnce({ ok: true, value: [TURN1_USER, TURN1_ASSISTANT] })
      .mockResolvedValueOnce({ ok: true, value: [TURN1_USER, TURN1_ASSISTANT, TURN2_USER, TURN2_ASSISTANT] });
    mockedSendMessage.mockResolvedValueOnce({ ok: true, value: TURN1_USER }).mockResolvedValueOnce({ ok: true, value: TURN2_USER });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");

    submitViaComposer("第一輪");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));

    submitViaComposer("第二輪");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(4));

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("第一輪");
    expect(items[1]).toHaveTextContent("AI");
    expect(items[2]).toHaveTextContent("第二輪");
    expect(items[3]).toHaveTextContent("AI");
    expect(mockedSendMessage).toHaveBeenCalledTimes(2);
  });

  // 11-app-shell/phase-3. 刪掉(不是改寫)——這條測的場景是「兩個各自獨立、
  // 都在本地串流的回合,各自的停止按鈕互不影響」。在新架構下,送出永遠不會
  // 進入「streaming」狀態(見 E03-S010 開頭說明),而唯一還能進入的入口
  // (重新產生)只可能對「最後一則已結算的助理回覆」動作(E03-S019「only the
  // last entry gets it」),所以「兩個同時獨立串流的回合」這個前提本身不可能
  // 再發生——不是換個觸發動作就能重現,是這個情境已經不存在。
});

describe("MessageThread conversation context indicator (E03-S018)", () => {
  it("does not show the indicator at all when there are no messages yet (EmptyState already says so)", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("尚無訊息，開始對話吧。");
    expect(screen.queryByText("上下文：目前尚無先前訊息。")).not.toBeInTheDocument();
  });

  it("shows the indicator's own empty-context message once a first message is in flight, before it settles", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockReturnValue(new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("第一輪");

    // The list is no longer empty (it holds the optimistic pending
    // entry), so EmptyState is gone and the indicator's own "尚無先前
    // 訊息" is no longer a redundant duplicate — sentMessageCount is
    // still legitimately 0 since nothing has settled yet.
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("傳送中…"));
    expect(screen.getByText("上下文：目前尚無先前訊息。")).toBeInTheDocument();
  });

  it("shows the correct count for previously-sent messages loaded on mount", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "已完成的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    expect(await screen.findByText("上下文：包含 2 則先前訊息。")).toBeInTheDocument();
  });

  it("does not count a still-pending or still-streaming entry toward the context count", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockReturnValue(new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("第一輪");

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("傳送中…"));
    expect(screen.getByText("上下文：目前尚無先前訊息。")).toBeInTheDocument();
  });

  /**
   * 11-app-shell/phase-3 (B 類:改寫,不刪). 原本的情境「使用者訊息已結算,
   * 助理回覆仍在本地串流」不再存在——送出不再觸發本地串流(見 E03-S010
   * describe 開頭的說明)。決定性的性質沒有變:使用者剛送出、已經樂觀顯示
   * 的訊息要立刻算進上下文,不必等到伺服器那則助理回覆也一起回來;變的只是
   * 「助理回覆還沒回來」這個窗口現在是什麼——不是本地串流的 phase,是
   * `refetchAndMergeMessages()` 的 `listMessages()` 呼叫還沒 resolve 的
   * 那段時間。手動控制第二次(refetch 那次)`listMessages()` 呼叫何時
   * resolve,藉此觀察「還沒收到助理回覆前」與「收到後」兩個時間點的則數。
   */
  it("counts the user's own message once it settles, even before the refetch bringing the assistant's reply resolves", async () => {
    let releaseRefetch!: () => void;
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    mockedListMessages.mockResolvedValueOnce({ ok: true, value: [] }).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          void refetchGate.then(() =>
            resolve({
              ok: true,
              value: [
                SENT_USER_MESSAGE,
                { id: "a1", conversationId: "c1", role: "assistant", content: "回覆內容", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
              ],
            }),
          );
        }),
    );
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("第一輪");

    // 使用者訊息已經樂觀顯示、已經送出成功,但 refetch 尚未 resolve——只算
    // 進使用者自己那一則,不是 0(還沒算)也不是 2(還沒真的有助理回覆)。
    await waitFor(() => expect(screen.getByText("上下文：包含 1 則先前訊息。")).toBeInTheDocument());

    releaseRefetch();
    await waitFor(() => expect(screen.getByText("上下文：包含 2 則先前訊息。")).toBeInTheDocument());
  });

  // 11-app-shell/phase-3 (B 類:改寫,不刪,理由與上一條相同). 伺服器在同一個
  // 交易裡就把使用者訊息與助理回覆一起產生好,所以這裡讓 refetch 一次回傳
  // 兩則,而不是靠 streamAssistantReply 在瀏覽器端逐字組出助理回覆。
  it("updates the count to 2 once a full turn (user + assistant) settles", async () => {
    mockedListMessages.mockResolvedValueOnce({ ok: true, value: [] }).mockResolvedValueOnce({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "回覆內容", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("第一輪");

    await waitFor(() => expect(screen.getByText("上下文：包含 2 則先前訊息。")).toBeInTheDocument());
  });

  it("updates the count to 4 after a second full turn settles", async () => {
    const TURN1_USER = { id: "u1", conversationId: "c1", role: "user" as const, content: "第一輪", attachmentNames: [], createdAt: "2026-08-14T00:00:00.000Z" };
    const TURN1_ASSISTANT = { id: "a1", conversationId: "c1", role: "assistant" as const, content: "回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" };
    const TURN2_USER = { id: "u2", conversationId: "c1", role: "user" as const, content: "第二輪", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" };
    const TURN2_ASSISTANT = { id: "a2", conversationId: "c1", role: "assistant" as const, content: "回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" };

    mockedListMessages
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockResolvedValueOnce({ ok: true, value: [TURN1_USER, TURN1_ASSISTANT] })
      .mockResolvedValueOnce({ ok: true, value: [TURN1_USER, TURN1_ASSISTANT, TURN2_USER, TURN2_ASSISTANT] });
    mockedSendMessage.mockResolvedValueOnce({ ok: true, value: TURN1_USER }).mockResolvedValueOnce({ ok: true, value: TURN2_USER });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");

    submitViaComposer("第一輪");
    await waitFor(() => expect(screen.getByText("上下文：包含 2 則先前訊息。")).toBeInTheDocument());

    submitViaComposer("第二輪");
    await waitFor(() => expect(screen.getByText("上下文：包含 4 則先前訊息。")).toBeInTheDocument());
  });
});

describe("MessageThread regenerate answer action (E03-S019)", () => {
  it("shows a 重新產生 button on the last settled assistant reply, but not on the user's own message", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "已完成的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("已完成的回覆");
    expect(screen.getAllByRole("button", { name: "重新產生" })).toHaveLength(1);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).not.toHaveTextContent("重新產生");
    expect(items[1]).toHaveTextContent("重新產生");
  });

  it("does not show 重新產生 on an earlier assistant reply once a newer turn exists — only the last entry gets it", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
        {
          id: "m2",
          conversationId: "c1",
          role: "user",
          content: "第二個問題",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:02.000Z",
        },
        {
          id: "a2",
          conversationId: "c1",
          role: "assistant",
          content: "第二輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:03.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("第二輪回覆");
    expect(screen.getAllByRole("button", { name: "重新產生" })).toHaveLength(1);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).not.toHaveTextContent("重新產生");
    expect(items[3]).toHaveTextContent("重新產生");
  });

  it("clicking 重新產生 revises the old message in place and starts a fresh stream that replaces its content", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "舊的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "新的回覆";
    });
    mockedReviseMessage.mockResolvedValue({
      ok: true,
      value: {
        id: "a1",
        conversationId: "c1",
        role: "assistant",
        content: "新的回覆",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:01.000Z",
        revisions: ["舊的回覆"],
      },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");

    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    // E03-S020: finalizes through reviseMessage (update-in-place, same
    // id "a1"), not receiveAssistantReply (which would mint a new row) —
    // this is what makes retaining the old content as a revision
    // possible at all (see messages.ts's reviseMessage doc comment).
    // E03-S021: the 3rd arg is "ANSWERED" — this fixture's "a1" has no
    // explicit `state`, so handleRegenerate's `originalMessage.state ??
    // "ANSWERED"` fallback applies (see the dedicated E03-S021 describe
    // block below for the case where an original state IS reused).
    await waitFor(() => expect(mockedReviseMessage).toHaveBeenCalledWith("a1", "新的回覆", "ANSWERED"));
    expect(mockedReceiveAssistantReply).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("新的回覆")).toBeInTheDocument());
    // Exactly one user message + one (regenerated) assistant reply —
    // the old reply is genuinely replaced as the CURRENT content, not
    // left behind as a second top-level entry (Functional AC 5: no
    // undefined duplicate side effect).
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    // E03-S020: "舊的回覆" is retained, not gone — it now appears inside
    // the revision history rather than as the current reply.
    expect(screen.getByText("先前版本（1）")).toBeInTheDocument();
    expect(screen.getByText("舊的回覆")).toBeInTheDocument();
  });

  it("locks the composer while a regeneration is in flight, same as any other turn", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "舊的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
    mockedRunGenerationPhases.mockImplementation(async function* () {
      yield "searching";
      await new Promise<void>(() => {});
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");

    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    await waitFor(() => expect(screen.getByText("搜尋中…")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "不該送得出去" } });
    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
  });

  it("E03-S020: stopping a regeneration before any content arrives restores the original reply unchanged", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "舊的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
    // Gated with a controllable Promise (not the default empty-generator
    // mock, and not an eternally-pending one either) — with the default,
    // the whole phase+stream sequence completes so fast that "streaming"
    // never reliably paints before settling; with an eternally-pending
    // await, the loop can never regain control to check the stop flag
    // at all. Both are the exact traps E03-S012's own evidence file
    // documents. Click stop, THEN release the gate, so the loop's
    // `.next()` finally resolves and notices the flag on its next check.
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    mockedRunGenerationPhases.mockImplementation(async function* () {
      yield "searching";
      await gate;
      yield "reading";
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");

    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "停止生成" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "停止生成" }));
    releaseGate();

    // Unlike S19 (where the old row was deleted up front, so an empty
    // stop lost the reply entirely), S20 never touches the original row
    // until reviseMessage() actually runs — so an empty stop simply
    // restores it exactly as it was: no revision was ever recorded, and
    // neither finalize path was called at all.
    await waitFor(() => expect(screen.getByText("舊的回覆")).toBeInTheDocument());
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("先前版本", { exact: false })).not.toBeInTheDocument();
    expect(mockedReceiveAssistantReply).not.toHaveBeenCalled();
    expect(mockedReviseMessage).not.toHaveBeenCalled();
  });
});

describe("MessageThread answer revision (E03-S020)", () => {
  it("shows no revision history for a reply that has never been regenerated", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "唯一版本",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("唯一版本");
    expect(screen.queryByText("先前版本", { exact: false })).not.toBeInTheDocument();
  });

  it("regenerating twice accumulates two revisions, shown oldest first", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "版本一",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
    mockedStreamAssistantReply
      .mockImplementationOnce(async function* () {
        yield "版本二";
      })
      .mockImplementationOnce(async function* () {
        yield "版本三";
      });
    mockedReviseMessage
      .mockResolvedValueOnce({
        ok: true,
        value: {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "版本二",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          revisions: ["版本一"],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "版本三",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          revisions: ["版本一", "版本二"],
        },
      });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("版本一");

    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));
    await waitFor(() => expect(screen.getByText("版本二")).toBeInTheDocument());
    expect(screen.getByText("先前版本（1）")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));
    await waitFor(() => expect(screen.getByText("版本三")).toBeInTheDocument());

    expect(screen.getByText("先前版本（2）")).toBeInTheDocument();
    // Oldest first — matches reviseMessage's append order (see
    // messages.test.ts's "accumulates multiple revisions in order").
    const details = screen.getByText("先前版本（2）").closest("details");
    if (!details) throw new Error("expected a <details> ancestor for the 先前版本 summary");
    expect(details).toHaveTextContent(/版本一[\s\S]*版本二/);
  });
});

describe("MessageThread answer state rendering (E03-S021)", () => {
  it("shows no state badge for a normal reply with no explicit state (undefined defaults to ANSWERED)", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "已完成的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("已完成的回覆");
    // Not even ANSWERED's own label ("已回答") should render — the
    // common case looks exactly as it did before this story existed.
    for (const state of ANSWER_STATES) {
      expect(screen.queryByText(ANSWER_STATE_LABELS[state])).not.toBeInTheDocument();
    }
  });

  it.each(ANSWER_STATES.filter((state) => state !== "ANSWERED"))("renders the %s badge with the correct label and role", async (state) => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "回覆內容",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          state,
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    const badge = await screen.findByText(ANSWER_STATE_LABELS[state]);
    if (state === "ERROR" || state === "PERMISSION_DENIED") {
      // Permanent, settled negative states use role="alert" — NOT
      // "status", which every E2E spec's waitForThreadToSettle helper
      // treats as "still busy" and would never see hit 0 again once a
      // reply settles into one of these two states.
      expect(badge).toHaveAttribute("role", "alert");
    } else {
      expect(badge).not.toHaveAttribute("role");
    }
  });

  // 11-app-shell/phase-3 (ADR 0017 第二步). 刪掉這兩條(不是改寫)——它們測
  // 的正是 ADR 0017 指名移除的行為本身:「送出這個動作,從問題文字現場
  // classify 出一個 state」。這條分類路徑(`classifyAnswerState(content)`)
  // 已經整個從 attemptSend 拿掉,沒有替代場景,因為「從送出的文字分類」這件
  // 事本身不再發生——下面的 "regenerating reuses the original message's own
  // state instead of reclassifying" 才是這條故事線今天唯一還成立的部分:
  // 重新產生「不」分類,直接沿用已結算訊息自己的 state,而這條測試已經是
  // 綠燈,不需要改。

  it("regenerating reuses the original message's own state instead of reclassifying", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "舊的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          state: "PERMISSION_DENIED",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");

    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    await waitFor(() => expect(mockedReviseMessage).toHaveBeenCalled());
    // The click itself carries no new question text to reclassify from
    // — regenerating answers the same underlying question, so it keeps
    // the same mock classification "a1" already had.
    expect(mockedReviseMessage.mock.calls[0]?.[2]).toBe("PERMISSION_DENIED");
  });

  /**
   * 11-app-shell/phase-3 (B 類:改寫,不刪). FEATURE.md 明文:「六個
   * AnswerState 的渲染碼與其測試留著(給定 state → 畫對徽章),拿掉的只有
   * 「從問題文字捏造 state」的來源」——這條測的正是「給定 PARTIAL state,
   * runStream 走真的串流路徑」這個渲染碼分支本身,不是分類來源,所以改寫
   * 觸發動作、不刪。原本靠送出時的觸發字串把 state 分類成 PARTIAL,現在
   * 讓原始訊息自己就帶著 `state: "PARTIAL"`,經由「重新產生」
   * (`originalMessage.state ?? "ANSWERED"`,見 message-thread.tsx)
   * 直接沿用,完全不經過任何分類。持久化呼叫對應換成 `reviseMessage`。
   */
  it("PARTIAL keeps the normal streamed reply content alongside its badge, unlike the other non-ANSWERED states", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "舊的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          state: "PARTIAL",
        },
      ],
    });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "這是真的串流內容";
    });
    // Echo back whatever content/state runStream actually finalizes
    // with — same as the real function would — rather than the
    // unrelated beforeEach default, so the FINAL settled render (not
    // just the transient streaming moment) reflects what was persisted.
    mockedReviseMessage.mockImplementation(async (_id, content, state) => ({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content, state, attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", revisions: ["舊的回覆"] },
    }));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");
    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    await waitFor(() => expect(screen.getByText("這是真的串流內容")).toBeInTheDocument());
    expect(screen.getByText("部分回答")).toBeInTheDocument();
    expect(mockedReviseMessage.mock.calls[0]?.[1]).toBe("這是真的串流內容");
  });

  // 11-app-shell/phase-3 (B 類:改寫,不刪,理由與上一條相同——這是同一段
  // runStream 分支的另一半:有 fallbackContent 的四個 state 完全不走
  // streamAssistantReply)。原始訊息自己帶著目標 state,經由「重新產生」
  // 沿用,持久化呼叫對應換成 reviseMessage。
  it.each(ANSWER_STATES.filter((state) => state !== "ANSWERED" && state !== "PARTIAL"))(
    "%s replaces content with fixed fallback text without ever calling streamAssistantReply",
    async (state) => {
      mockedListMessages.mockResolvedValue({
        ok: true,
        value: [
          SENT_USER_MESSAGE,
          {
            id: "a1",
            conversationId: "c1",
            role: "assistant",
            content: "舊的回覆",
            attachmentNames: [],
            createdAt: "2026-08-14T00:00:01.000Z",
            state,
          },
        ],
      });
      const fallbackContent = ANSWER_STATE_FALLBACK_CONTENT[state];
      expect(fallbackContent).toBeDefined();
      if (!fallbackContent) return;
      // Echo back whatever content/state runStream actually finalizes
      // with, same as the real function would — see the PARTIAL test
      // above for why the unrelated beforeEach default isn't enough
      // once the FINAL settled render (not just the transient
      // streaming moment) is what's being asserted on.
      mockedReviseMessage.mockImplementation(async (_id, content, resultState) => ({
        ok: true,
        value: { id: "a1", conversationId: "c1", role: "assistant", content, state: resultState, attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", revisions: ["舊的回覆"] },
      }));

      render(<MessageThread conversationId="c1" />);
      await screen.findByText("舊的回覆");
      fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

      await waitFor(() => expect(screen.getByText(fallbackContent)).toBeInTheDocument());
      expect(mockedStreamAssistantReply).not.toHaveBeenCalled();
      expect(mockedReviseMessage.mock.calls[0]?.[1]).toBe(fallbackContent);
    },
  );

  // 11-app-shell/phase-2, ADR 0018 Decision 2 條件 2: this file's own
  // message-thread.tsx used to compute the badge's `answerState` as
  // `entry.message.state ?? "ANSWERED"` inline — silently guessing
  // ANSWERED for a message an upstream feature (03-conversation/phase-2)
  // deliberately left `state`-less. That line now instead calls
  // `resolveAnswerStateDisplay(entry.message.state)` (see
  // lib/answer-state.ts), which returns the distinct "UNSET" for an
  // absent state rather than silently reusing "ANSWERED".
  //
  // Naively you'd guard that fix with "an assistant reply with no
  // `state` renders no badge" (already covered above, at this describe
  // block's very first test). That guard is real but WEAKER than it
  // looks: it was verified empirically (not assumed) that it does
  // nothing to catch a regression back to the inline `?? "ANSWERED"` —
  // reverting message-thread.tsx to exactly that inline expression and
  // re-running this entire file (all 160 pre-existing tests, this
  // describe block's own included) left every test green, because the
  // JSX guard right after that line is
  // `answerState !== "ANSWERED" && answerState !== "UNSET"`: "ANSWERED"
  // and "UNSET" are BOTH excluded, so they render byte-for-byte
  // identical output (no badge, no alert, nothing) for every possible
  // input. There is no DOM-only assertion that can tell them apart as
  // currently rendered — the divergence is real at the data-flow level
  // but is not (today) observable in rendered text/role/attributes.
  //
  // The only way to actually pin the fix, therefore, is to assert that
  // the component calls the shared resolver at all — i.e. that the
  // guessing has genuinely moved out of message-thread.tsx and into
  // lib/answer-state.ts, not just that the two states happen to look
  // the same today. Each test below pairs that spy assertion with its
  // own DOM assertion so a reader can see both what's rendered and that
  // rendering got there via the real delegation, not an inline guess.
  describe("resolveAnswerStateDisplay wiring — DOM-invisible regression guard", () => {
    let resolveAnswerStateDisplaySpy: MockInstance<typeof answerStateModule.resolveAnswerStateDisplay>;

    beforeEach(() => {
      resolveAnswerStateDisplaySpy = vi.spyOn(answerStateModule, "resolveAnswerStateDisplay");
    });

    afterEach(() => {
      resolveAnswerStateDisplaySpy.mockRestore();
    });

    it("an assistant reply with no `state` field renders no badge, reached by calling resolveAnswerStateDisplay(undefined) — not an inline `?? \"ANSWERED\"` guess", async () => {
      mockedListMessages.mockResolvedValue({
        ok: true,
        value: [
          SENT_USER_MESSAGE,
          {
            id: "a1",
            conversationId: "c1",
            role: "assistant",
            content: "已完成的回覆",
            attachmentNames: [],
            createdAt: "2026-08-14T00:00:01.000Z",
            // state deliberately omitted — the ADR 0018 case.
          },
        ],
      });

      render(<MessageThread conversationId="c1" />);
      await screen.findByText("已完成的回覆");

      for (const state of ANSWER_STATES) {
        expect(screen.queryByText(ANSWER_STATE_LABELS[state])).not.toBeInTheDocument();
      }
      expect(resolveAnswerStateDisplaySpy).toHaveBeenCalledWith(undefined);
    });

    it("an assistant reply with an EXPLICIT state of \"ANSWERED\" also renders no badge — anti-cheat: rules out an implementation that maps every input, real or absent, to one fixed neutral value", async () => {
      mockedListMessages.mockResolvedValue({
        ok: true,
        value: [
          SENT_USER_MESSAGE,
          {
            id: "a1",
            conversationId: "c1",
            role: "assistant",
            content: "已完成的回覆",
            attachmentNames: [],
            createdAt: "2026-08-14T00:00:01.000Z",
            state: "ANSWERED",
          },
        ],
      });

      render(<MessageThread conversationId="c1" />);
      await screen.findByText("已完成的回覆");

      for (const state of ANSWER_STATES) {
        expect(screen.queryByText(ANSWER_STATE_LABELS[state])).not.toBeInTheDocument();
      }
      // Distinct call argument from the previous test (the real string
      // "ANSWERED", not undefined) — proves this test exercises the
      // explicit-ANSWERED path through the resolver, not a copy-pasted
      // assertion left over from the absent-state test above.
      expect(resolveAnswerStateDisplaySpy).toHaveBeenCalledWith("ANSWERED");
    });

    it("an assistant reply whose state actually IS NO_EVIDENCE renders that badge with its real label — proves badge-showing states aren't swallowed into the same neutral path as the two tests above", async () => {
      mockedListMessages.mockResolvedValue({
        ok: true,
        value: [
          SENT_USER_MESSAGE,
          {
            id: "a1",
            conversationId: "c1",
            role: "assistant",
            content: "查無依據的回覆",
            attachmentNames: [],
            createdAt: "2026-08-14T00:00:01.000Z",
            state: "NO_EVIDENCE",
          },
        ],
      });

      render(<MessageThread conversationId="c1" />);
      await screen.findByText("查無依據的回覆");

      const badge = await screen.findByText(ANSWER_STATE_LABELS.NO_EVIDENCE);
      // NO_EVIDENCE is a plain badge, not role="alert" (that's reserved
      // for ERROR/PERMISSION_DENIED — see this describe block's earlier
      // it.each covering that split).
      expect(badge).not.toHaveAttribute("role");
      for (const state of ANSWER_STATES) {
        if (state === "NO_EVIDENCE") continue;
        expect(screen.queryByText(ANSWER_STATE_LABELS[state])).not.toBeInTheDocument();
      }
      expect(resolveAnswerStateDisplaySpy).toHaveBeenCalledWith("NO_EVIDENCE");
    });
  });
});

describe("MessageThread copy answer action (E03-S027)", () => {
  // navigator.clipboard doesn't exist in jsdom by default — stubbed
  // locally to this describe block since no other section of this file
  // needs it. Restored in afterEach (independent review MINOR finding:
  // an un-torn-down Object.defineProperty stub only happened to be safe
  // by virtue of this being the LAST describe block in the file — a
  // block added after this one would silently inherit a faked
  // navigator.clipboard otherwise).
  const mockedWriteText = vi.fn();
  let originalClipboardDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    mockedWriteText.mockReset();
    originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockedWriteText },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("shows a 複製 button on every settled assistant reply (not just the last one), but not on the user's own message", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        { id: "a2", conversationId: "c1", role: "assistant", content: "第二輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("第二輪回覆");
    expect(screen.getAllByRole("button", { name: "複製" })).toHaveLength(2);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).not.toHaveTextContent("複製");
    expect(items[1]).toHaveTextContent("複製");
    expect(items[2]).not.toHaveTextContent("複製");
    expect(items[3]).toHaveTextContent("複製");
  });

  it("clicking 複製 writes that message's raw content (including citation markers, as plain text) to the clipboard and shows 已複製", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "本季成長 12%[1]，主要來自新客戶導入。",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
    mockedWriteText.mockResolvedValue(undefined);

    render(<MessageThread conversationId="c1" />);
    await screen.findByText(/本季成長/);

    fireEvent.click(screen.getByRole("button", { name: "複製" }));

    await waitFor(() => expect(mockedWriteText).toHaveBeenCalledWith("本季成長 12%[1]，主要來自新客戶導入。"));
    expect(await screen.findByRole("button", { name: "已複製" })).toBeInTheDocument();
  });

  it("copying one message does not mark a different message's button as 已複製", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        { id: "a2", conversationId: "c1", role: "assistant", content: "第二輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" },
      ],
    });
    mockedWriteText.mockResolvedValue(undefined);

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第二輪回覆");

    const copyButtons = screen.getAllByRole("button", { name: "複製" });
    fireEvent.click(copyButtons[0]!);

    await waitFor(() => expect(mockedWriteText).toHaveBeenCalledWith("第一輪回覆"));
    expect(await screen.findByRole("button", { name: "已複製" })).toBeInTheDocument();
    // Exactly one 已複製 — the other assistant reply's button is untouched.
    expect(screen.getAllByRole("button", { name: "複製" })).toHaveLength(1);
  });

  it("已複製 automatically reverts back to 複製 after a short delay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockedListMessages.mockResolvedValue({
        ok: true,
        value: [
          SENT_USER_MESSAGE,
          { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        ],
      });
      mockedWriteText.mockResolvedValue(undefined);

      render(<MessageThread conversationId="c1" />);
      await screen.findByText("第一輪回覆");

      fireEvent.click(screen.getByRole("button", { name: "複製" }));
      expect(await screen.findByRole("button", { name: "已複製" })).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByRole("button", { name: "複製" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a distinct error message and keeps the 複製 label when the clipboard write fails", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    mockedWriteText.mockRejectedValue(new Error("denied"));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "複製" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("複製失敗，請手動選取複製。");
    expect(screen.getByRole("button", { name: "複製" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "已複製" })).not.toBeInTheDocument();
  });

  it("disables the button while the copy is in flight", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    let resolveWrite!: () => void;
    mockedWriteText.mockReturnValue(new Promise<void>((resolve) => (resolveWrite = resolve)));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "複製" }));

    expect(screen.getByRole("button", { name: "複製" })).toBeDisabled();

    resolveWrite();
    await waitFor(() => expect(screen.getByRole("button", { name: "已複製" })).not.toBeDisabled());
  });

  it("copying two different messages with out-of-order resolution shows each one's own correct final state (no cross-message race)", async () => {
    // Independent review MAJOR finding: an earlier version of this
    // story shared ONE feedback slot across every message, so message
    // B's write resolving BEFORE message A's (no ordering guarantee
    // exists for two independent async operations) let B's success
    // silently overwrite A's already-shown confirmation, and orphaned
    // per-click timeouts could clear an unrelated message's state.
    // copyStatuses/copyResetTimeoutsRef are now keyed by messageId
    // specifically to make that structurally impossible — this test
    // reproduces the exact out-of-order scenario the review found.
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        { id: "a2", conversationId: "c1", role: "assistant", content: "第二輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" },
      ],
    });
    let resolveA1!: () => void;
    let resolveA2!: () => void;
    mockedWriteText.mockImplementation((content: unknown) => {
      if (content === "第一輪回覆") return new Promise<void>((resolve) => (resolveA1 = resolve));
      return new Promise<void>((resolve) => (resolveA2 = resolve));
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第二輪回覆");

    const items = screen.getAllByRole("listitem");
    fireEvent.click(within(items[1]!).getByRole("button", { name: "複製" }));
    fireEvent.click(within(items[3]!).getByRole("button", { name: "複製" }));

    // a2 (clicked second) resolves FIRST.
    resolveA2();
    await waitFor(() => expect(within(items[3]!).getByRole("button", { name: "已複製" })).toBeInTheDocument());
    // a1 must still show its OWN in-flight pending state — untouched by
    // a2's unrelated success.
    expect(within(items[1]!).getByRole("button", { name: "複製" })).toBeDisabled();

    resolveA1();
    // Both now correctly show 已複製 at the same time — independent
    // slots, not one shared one that only ever reflects the latest click.
    await waitFor(() => expect(within(items[1]!).getByRole("button", { name: "已複製" })).toBeInTheDocument());
    expect(within(items[3]!).getByRole("button", { name: "已複製" })).toBeInTheDocument();
  });
});

describe("MessageThread answer OK feedback (E13-S001)", () => {
  it("shows a 有幫助 button on every settled assistant reply (not just the last one), but not on the user's own message", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        { id: "a2", conversationId: "c1", role: "assistant", content: "第二輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("第二輪回覆");
    expect(screen.getAllByRole("button", { name: "有幫助" })).toHaveLength(2);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).not.toHaveTextContent("有幫助");
    expect(items[1]).toHaveTextContent("有幫助");
    expect(items[2]).not.toHaveTextContent("有幫助");
    expect(items[3]).toHaveTextContent("有幫助");
  });

  it("clicking 有幫助 submits OK feedback for that message and shows 已回饋：有幫助", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    mockedSubmitAnswerFeedback.mockResolvedValue({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", feedback: "OK" },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "有幫助" }));

    await waitFor(() => expect(mockedSubmitAnswerFeedback).toHaveBeenCalledWith("a1", "OK"));
    expect(await screen.findByRole("button", { name: "已回饋：有幫助" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "有幫助" })).not.toBeInTheDocument();
  });

  it("renders 已回饋：有幫助 immediately for a message that already has feedback recorded (e.g. after reload)", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          feedback: "OK",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByRole("button", { name: "已回饋：有幫助" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "有幫助" })).not.toBeInTheDocument();
  });

  it("disables the 已回饋：有幫助 button once feedback has been given, so it cannot be submitted again", async () => {
    // Independent review MAJOR finding: every other test in this
    // describe block that reaches the "已回饋：有幫助" label only
    // asserted the button's accessible name, never .toBeDisabled() —
    // an adversarial mutation removing the `entry.message.feedback ===
    // "OK"` half of message-thread.tsx's disabled condition (leaving
    // only the in-flight-pending half) passed all 91 pre-existing
    // tests unnoticed, meaning a real regression that lets an
    // already-given verdict be resubmitted had zero coverage. This
    // test closes that gap directly.
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          feedback: "OK",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    const feedbackButton = screen.getByRole("button", { name: "已回饋：有幫助" });
    expect(feedbackButton).toBeDisabled();

    fireEvent.click(feedbackButton);
    expect(mockedSubmitAnswerFeedback).not.toHaveBeenCalled();
  });

  it("giving feedback on one message does not mark a different message as 已回饋：有幫助", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        { id: "a2", conversationId: "c1", role: "assistant", content: "第二輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" },
      ],
    });
    mockedSubmitAnswerFeedback.mockResolvedValue({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", feedback: "OK" },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第二輪回覆");

    const feedbackButtons = screen.getAllByRole("button", { name: "有幫助" });
    fireEvent.click(feedbackButtons[0]!);

    expect(await screen.findByRole("button", { name: "已回饋：有幫助" })).toBeInTheDocument();
    // Exactly one 有幫助 button remains — the other assistant reply is untouched.
    expect(screen.getAllByRole("button", { name: "有幫助" })).toHaveLength(1);
  });

  it("disables the button while the feedback submission is in flight", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    let resolveSubmit!: (value: Awaited<ReturnType<typeof submitAnswerFeedback>>) => void;
    mockedSubmitAnswerFeedback.mockReturnValue(new Promise((resolve) => (resolveSubmit = resolve)));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "有幫助" }));

    expect(screen.getByRole("button", { name: "有幫助" })).toBeDisabled();

    resolveSubmit({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", feedback: "OK" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "已回饋：有幫助" })).toBeInTheDocument());
  });

  it("shows a distinct error message and keeps the 有幫助 button enabled (for retry) when submission fails", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    mockedSubmitAnswerFeedback.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這則訊息。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "有幫助" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("回饋送出失敗，請再試一次。");
    expect(screen.getByRole("button", { name: "有幫助" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "已回饋：有幫助" })).not.toBeInTheDocument();
  });
});

describe("MessageThread answer NG feedback (E13-S002)", () => {
  it("shows a 沒有幫助 button alongside 有幫助 on every settled assistant reply, but not on the user's own message", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        { id: "a2", conversationId: "c1", role: "assistant", content: "第二輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("第二輪回覆");
    expect(screen.getAllByRole("button", { name: "沒有幫助" })).toHaveLength(2);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).not.toHaveTextContent("沒有幫助");
    expect(items[1]).toHaveTextContent("沒有幫助");
    expect(items[2]).not.toHaveTextContent("沒有幫助");
    expect(items[3]).toHaveTextContent("沒有幫助");
  });

  it("clicking 沒有幫助 submits NG feedback for that message and shows 已回饋：沒有幫助", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    mockedSubmitAnswerFeedback.mockResolvedValue({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", feedback: "NG" },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "沒有幫助" }));

    await waitFor(() => expect(mockedSubmitAnswerFeedback).toHaveBeenCalledWith("a1", "NG"));
    expect(await screen.findByRole("button", { name: "已回饋：沒有幫助" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "沒有幫助" })).not.toBeInTheDocument();
  });

  it("renders 已回饋：沒有幫助 immediately for a message that already has NG feedback recorded (e.g. after reload)", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          feedback: "NG",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByRole("button", { name: "已回饋：沒有幫助" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "沒有幫助" })).not.toBeInTheDocument();
  });

  it("once OK feedback has been given, disables the 沒有幫助 button too — a verdict is a single choice, not two independent toggles", async () => {
    // Design decision (documented in EVIDENCE): OK/NG share ONE
    // `Message.feedback` field, not two independent booleans, mirroring
    // SOURCE_BASELINE's golden flow "...→ OK / NG → Feedback Loop"
    // (a single either/or judgment). Once either verdict is recorded,
    // BOTH buttons become permanently non-clickable — same "no undo
    // feedback" invariant E13-S001 already established for its own
    // button, just applied symmetrically now that a second button exists.
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          feedback: "OK",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    const ngButton = screen.getByRole("button", { name: "沒有幫助" });
    expect(ngButton).toBeDisabled();

    fireEvent.click(ngButton);
    expect(mockedSubmitAnswerFeedback).not.toHaveBeenCalled();
  });

  it("once NG feedback has been given, disables the 有幫助 button too", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          feedback: "NG",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    const okButton = screen.getByRole("button", { name: "有幫助" });
    expect(okButton).toBeDisabled();

    fireEvent.click(okButton);
    expect(mockedSubmitAnswerFeedback).not.toHaveBeenCalled();
  });

  it("disables the 已回饋：沒有幫助 button once NG feedback has been given, so it cannot be submitted again", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          feedback: "NG",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    const feedbackButton = screen.getByRole("button", { name: "已回饋：沒有幫助" });
    expect(feedbackButton).toBeDisabled();

    fireEvent.click(feedbackButton);
    expect(mockedSubmitAnswerFeedback).not.toHaveBeenCalled();
  });

  it("giving NG feedback on one message does not mark a different message as 已回饋：沒有幫助", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        { id: "a2", conversationId: "c1", role: "assistant", content: "第二輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" },
      ],
    });
    mockedSubmitAnswerFeedback.mockResolvedValue({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", feedback: "NG" },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第二輪回覆");

    const feedbackButtons = screen.getAllByRole("button", { name: "沒有幫助" });
    fireEvent.click(feedbackButtons[0]!);

    await screen.findByRole("button", { name: "已回饋：沒有幫助" });
    const items = screen.getAllByRole("listitem");
    // a1's row: verdict recorded, both its buttons disabled (OK stays
    // labeled 有幫助 since NG — not OK — was given; NG flips to 已回饋).
    expect(within(items[1]!).getByRole("button", { name: "有幫助" })).toBeDisabled();
    expect(within(items[1]!).getByRole("button", { name: "已回饋：沒有幫助" })).toBeDisabled();
    // a2's row: completely untouched, both buttons still enabled.
    expect(within(items[3]!).getByRole("button", { name: "有幫助" })).toBeEnabled();
    expect(within(items[3]!).getByRole("button", { name: "沒有幫助" })).toBeEnabled();
  });

  it("disables both 有幫助 and 沒有幫助 while an NG submission is in flight", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    let resolveSubmit!: (value: Awaited<ReturnType<typeof submitAnswerFeedback>>) => void;
    mockedSubmitAnswerFeedback.mockReturnValue(new Promise((resolve) => (resolveSubmit = resolve)));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "沒有幫助" }));

    expect(screen.getByRole("button", { name: "沒有幫助" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "有幫助" })).toBeDisabled();

    resolveSubmit({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", feedback: "NG" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "已回饋：沒有幫助" })).toBeInTheDocument());
  });

  it("shows a distinct error message and keeps both buttons enabled (for retry) when an NG submission fails", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    mockedSubmitAnswerFeedback.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這則訊息。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "沒有幫助" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("回饋送出失敗，請再試一次。");
    expect(screen.getByRole("button", { name: "沒有幫助" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "有幫助" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "已回饋：沒有幫助" })).not.toBeInTheDocument();
  });
});

describe("MessageThread feedback reason selector (E13-S003)", () => {
  const DEFAULT_NG_MESSAGE: {
    id: string;
    conversationId: string;
    role: "assistant";
    content: string;
    attachmentNames: string[];
    createdAt: string;
    feedback: AnswerFeedbackVerdict;
    feedbackReason?: FeedbackReason;
  } = {
    id: "a1",
    conversationId: "c1",
    role: "assistant",
    content: "第一輪回覆",
    attachmentNames: [],
    createdAt: "2026-08-14T00:00:01.000Z",
    feedback: "NG",
  };

  function ngMessage(overrides: Partial<typeof DEFAULT_NG_MESSAGE> = {}) {
    return { ...DEFAULT_NG_MESSAGE, ...overrides };
  }

  it("does not render a reason selector when no feedback has been given yet", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [SENT_USER_MESSAGE, { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" }],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.queryByText("為什麼沒有幫助？")).not.toBeInTheDocument();
  });

  it("does not render a reason selector when OK feedback was given", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [SENT_USER_MESSAGE, ngMessage({ feedback: "OK" })],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.queryByText("為什麼沒有幫助？")).not.toBeInTheDocument();
  });

  it("renders a reason selector with 4 radio options once NG feedback has been given, and the submit button starts disabled", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, ngMessage()] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByText("為什麼沒有幫助？")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "答案不正確" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "答案不完整" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "答案離題" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "其他" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "送出原因" })).toBeDisabled();
  });

  it("enables the submit button once a reason is selected, and clicking it submits that reason", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, ngMessage()] });
    mockedSubmitFeedbackReason.mockResolvedValue({ ok: true, value: ngMessage({ feedbackReason: "INCORRECT" }) });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("radio", { name: "答案不正確" }));
    expect(screen.getByRole("button", { name: "送出原因" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "送出原因" }));

    await waitFor(() => expect(mockedSubmitFeedbackReason).toHaveBeenCalledWith("a1", "INCORRECT"));
  });

  it("locks the whole selector (every radio + submit button disabled) and shows the chosen label once a reason has been recorded", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, ngMessage({ feedbackReason: "OFF_TOPIC" })] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByRole("radio", { name: "答案不正確" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "答案不完整" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "答案離題" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "其他" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "送出原因" })).toBeDisabled();
    expect(screen.getByText("已選擇原因：答案離題")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "答案離題" })).toBeChecked();
  });

  it("clicking the already-disabled submit button after a reason is recorded does not call submitFeedbackReason again", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, ngMessage({ feedbackReason: "OTHER" })] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "送出原因" }));
    expect(mockedSubmitFeedbackReason).not.toHaveBeenCalled();
  });

  it("disables all radios and the submit button while a reason submission is in flight", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, ngMessage()] });
    let resolveSubmit!: (value: Awaited<ReturnType<typeof submitFeedbackReason>>) => void;
    mockedSubmitFeedbackReason.mockReturnValue(new Promise((resolve) => (resolveSubmit = resolve)));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("radio", { name: "答案不完整" }));
    fireEvent.click(screen.getByRole("button", { name: "送出原因" }));

    expect(screen.getByRole("radio", { name: "答案不完整" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "答案不正確" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "送出原因" })).toBeDisabled();

    resolveSubmit({ ok: true, value: ngMessage({ feedbackReason: "INCOMPLETE" }) });
    await waitFor(() => expect(screen.getByText("已選擇原因：答案不完整")).toBeInTheDocument());
  });

  it("shows a distinct error message and re-enables the selector (for retry) when a reason submission fails", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, ngMessage()] });
    mockedSubmitFeedbackReason.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "只能為「沒有幫助」的回饋選擇原因。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("radio", { name: "答案離題" }));
    fireEvent.click(screen.getByRole("button", { name: "送出原因" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("原因送出失敗，請再試一次。");
    expect(screen.getByRole("radio", { name: "答案離題" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "送出原因" })).toBeEnabled();
    expect(screen.queryByText(/已選擇原因/)).not.toBeInTheDocument();
  });

  it("selecting/submitting a reason for one message does not affect a different message's selector", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        ngMessage({ id: "a1", content: "第一輪回覆" }),
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        ngMessage({ id: "a2", content: "第二輪回覆", createdAt: "2026-08-14T00:00:03.000Z" }),
      ],
    });
    mockedSubmitFeedbackReason.mockResolvedValue({ ok: true, value: ngMessage({ id: "a1", content: "第一輪回覆", feedbackReason: "INCORRECT" }) });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第二輪回覆");

    const items = screen.getAllByRole("listitem");
    fireEvent.click(within(items[1]!).getByRole("radio", { name: "答案不正確" }));
    fireEvent.click(within(items[1]!).getByRole("button", { name: "送出原因" }));

    await waitFor(() => expect(within(items[1]!).getByText("已選擇原因：答案不正確")).toBeInTheDocument());
    // a2's selector: completely untouched, still fully interactive.
    expect(within(items[3]!).getByRole("radio", { name: "答案不正確" })).toBeEnabled();
    expect(within(items[3]!).queryByText(/已選擇原因/)).not.toBeInTheDocument();
  });
});

describe("MessageThread free-text feedback (E13-S004)", () => {
  const DEFAULT_OK_MESSAGE: {
    id: string;
    conversationId: string;
    role: "assistant";
    content: string;
    attachmentNames: string[];
    createdAt: string;
    feedback: AnswerFeedbackVerdict;
    feedbackComment?: string;
  } = {
    id: "a1",
    conversationId: "c1",
    role: "assistant",
    content: "第一輪回覆",
    attachmentNames: [],
    createdAt: "2026-08-14T00:00:01.000Z",
    feedback: "OK",
  };

  function okMessage(overrides: Partial<typeof DEFAULT_OK_MESSAGE> = {}) {
    return { ...DEFAULT_OK_MESSAGE, ...overrides };
  }

  it("does not render a comment box when no feedback has been given yet", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [SENT_USER_MESSAGE, { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" }],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.queryByText("還有什麼想補充的嗎？")).not.toBeInTheDocument();
  });

  it("renders a comment box once OK feedback has been given, and the submit button starts disabled", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage()] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByText("還有什麼想補充的嗎？")).toBeInTheDocument();
    expect(screen.getByLabelText("留言")).toBeEnabled();
    expect(screen.getByRole("button", { name: "送出留言" })).toBeDisabled();
  });

  it("renders a comment box once NG feedback has been given (not gated to OK-only)", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage({ feedback: "NG" })] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByText("還有什麼想補充的嗎？")).toBeInTheDocument();
  });

  it("enables the submit button once non-whitespace text is typed, and clicking it submits that comment", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage()] });
    mockedSubmitFeedbackComment.mockResolvedValue({ ok: true, value: okMessage({ feedbackComment: "這個答案很清楚" }) });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.change(screen.getByLabelText("留言"), { target: { value: "這個答案很清楚" } });
    expect(screen.getByRole("button", { name: "送出留言" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "送出留言" }));

    await waitFor(() => expect(mockedSubmitFeedbackComment).toHaveBeenCalledWith("a1", "這個答案很清楚"));
  });

  it("keeps the submit button disabled for whitespace-only text", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage()] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.change(screen.getByLabelText("留言"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "送出留言" })).toBeDisabled();
  });

  it("keeps the submit button disabled for text exceeding MAX_FEEDBACK_COMMENT_LENGTH", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage()] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.change(screen.getByLabelText("留言"), { target: { value: "a".repeat(501) } });
    expect(screen.getByRole("button", { name: "送出留言" })).toBeDisabled();
  });

  it("locks the comment box (textarea + submit button disabled) and shows the stored comment once one has been recorded", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage({ feedbackComment: "已經送出的留言" })] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByLabelText("留言")).toBeDisabled();
    expect(screen.getByRole("button", { name: "送出留言" })).toBeDisabled();
    expect(screen.getByText("已送出留言：已經送出的留言")).toBeInTheDocument();
  });

  it("clicking the already-disabled submit button after a comment is recorded does not call submitFeedbackComment again", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage({ feedbackComment: "已經送出的留言" })] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "送出留言" }));
    expect(mockedSubmitFeedbackComment).not.toHaveBeenCalled();
  });

  it("disables the textarea and submit button while a comment submission is in flight", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage()] });
    let resolveSubmit!: (value: Awaited<ReturnType<typeof submitFeedbackComment>>) => void;
    mockedSubmitFeedbackComment.mockReturnValue(new Promise((resolve) => (resolveSubmit = resolve)));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.change(screen.getByLabelText("留言"), { target: { value: "送出中的留言" } });
    fireEvent.click(screen.getByRole("button", { name: "送出留言" }));

    expect(screen.getByLabelText("留言")).toBeDisabled();
    expect(screen.getByRole("button", { name: "送出留言" })).toBeDisabled();

    resolveSubmit({ ok: true, value: okMessage({ feedbackComment: "送出中的留言" }) });
    await waitFor(() => expect(screen.getByText("已送出留言：送出中的留言")).toBeInTheDocument());
  });

  it("shows a distinct error message and re-enables the comment box (for retry) when a comment submission fails", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage()] });
    mockedSubmitFeedbackComment.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "留言不得為空白。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.change(screen.getByLabelText("留言"), { target: { value: "會失敗的留言" } });
    fireEvent.click(screen.getByRole("button", { name: "送出留言" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("留言送出失敗，請再試一次。");
    expect(screen.getByLabelText("留言")).toBeEnabled();
    expect(screen.getByRole("button", { name: "送出留言" })).toBeEnabled();
    expect(screen.queryByText(/已送出留言/)).not.toBeInTheDocument();
  });

  it("typing/submitting a comment for one message does not affect a different message's comment box", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        okMessage({ id: "a1", content: "第一輪回覆" }),
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        okMessage({ id: "a2", content: "第二輪回覆", createdAt: "2026-08-14T00:00:03.000Z" }),
      ],
    });
    mockedSubmitFeedbackComment.mockResolvedValue({ ok: true, value: okMessage({ id: "a1", content: "第一輪回覆", feedbackComment: "只給第一則的留言" }) });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第二輪回覆");

    const items = screen.getAllByRole("listitem");
    fireEvent.change(within(items[1]!).getByLabelText("留言"), { target: { value: "只給第一則的留言" } });
    fireEvent.click(within(items[1]!).getByRole("button", { name: "送出留言" }));

    await waitFor(() => expect(within(items[1]!).getByText("已送出留言：只給第一則的留言")).toBeInTheDocument());
    // a2's comment box: completely untouched, still fully interactive.
    expect(within(items[3]!).getByLabelText("留言")).toBeEnabled();
    expect(within(items[3]!).queryByText(/已送出留言/)).not.toBeInTheDocument();
  });
});

// Uses the REAL lib/citations.ts (not mocked, same as the E03-S014
// citation preview block above) — getCitationSource("1")/("2") both
// resolve to real mock sources, so these tests exercise the actual
// click → drawer → feedback UI wiring end to end.
describe("MessageThread citation-specific feedback (E13-S005)", () => {
  const A1_TWO_CITATIONS = {
    id: "a1",
    conversationId: "c1",
    role: "assistant" as const,
    content: "本季成長 12%[1]，去年為 8%[2]",
    attachmentNames: [],
    createdAt: "2026-08-14T00:00:01.000Z",
  };

  it("shows 此引用有幫助/此引用不準確 buttons in the preview drawer for a settled assistant message's citation", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [A1_TWO_CITATIONS] });

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));

    expect(await screen.findByRole("button", { name: "此引用有幫助" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "此引用不準確" })).toBeInTheDocument();
  });

  it("clicking 此引用有幫助 submits OK citation feedback for the correct (messageId, citationId) pair and shows 已回饋：此引用有幫助", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [A1_TWO_CITATIONS] });
    mockedSubmitCitationFeedback.mockResolvedValue({ ok: true, value: { ...A1_TWO_CITATIONS, citationFeedback: { "1": "OK" } } });

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "此引用有幫助" }));

    await waitFor(() => expect(mockedSubmitCitationFeedback).toHaveBeenCalledWith("a1", "1", "OK"));
    expect(await screen.findByRole("button", { name: "已回饋：此引用有幫助" })).toBeInTheDocument();
  });

  it("renders 已回饋：此引用有幫助 immediately for a citation that already has feedback recorded (e.g. after reload)", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [{ ...A1_TWO_CITATIONS, citationFeedback: { "1": "OK" } }] });

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));

    expect(await screen.findByRole("button", { name: "已回饋：此引用有幫助" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "此引用有幫助" })).not.toBeInTheDocument();
  });

  it("disables BOTH citation feedback buttons once feedback has been given, so it cannot be submitted again", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [{ ...A1_TWO_CITATIONS, citationFeedback: { "1": "OK" } }] });

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));

    const givenButton = await screen.findByRole("button", { name: "已回饋：此引用有幫助" });
    const ngButton = screen.getByRole("button", { name: "此引用不準確" });
    expect(givenButton).toBeDisabled();
    expect(ngButton).toBeDisabled();

    fireEvent.click(givenButton);
    expect(mockedSubmitCitationFeedback).not.toHaveBeenCalled();
  });

  it("giving feedback on one citation does not mark a DIFFERENT citation within the SAME message as already-given", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [A1_TWO_CITATIONS] });
    mockedSubmitCitationFeedback.mockResolvedValue({ ok: true, value: { ...A1_TWO_CITATIONS, citationFeedback: { "1": "OK" } } });

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "此引用有幫助" }));
    await screen.findByRole("button", { name: "已回饋：此引用有幫助" });

    fireEvent.click(screen.getByRole("button", { name: "關閉" }));
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 2" }));

    // Citation "2" was never given feedback — still shows the un-given label, not "已回饋".
    expect(await screen.findByRole("button", { name: "此引用有幫助" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "已回饋：此引用有幫助" })).not.toBeInTheDocument();
  });

  it("giving feedback on a citation in one message does not affect the SAME citationId in a different message", async () => {
    const a1 = { ...A1_TWO_CITATIONS, id: "a1", content: "第一則回覆[1]" };
    const a2 = { ...A1_TWO_CITATIONS, id: "a2", content: "第二則回覆[1]" };
    mockedListMessages.mockResolvedValue({ ok: true, value: [a1, a2] });
    mockedSubmitCitationFeedback.mockResolvedValue({ ok: true, value: { ...a1, citationFeedback: { "1": "OK" } } });

    render(<MessageThread conversationId="c1" />);
    const citationButtons = await screen.findAllByRole("button", { name: "檢視引用來源 1" });
    expect(citationButtons).toHaveLength(2);

    fireEvent.click(citationButtons[0]!); // a1's citation "1"
    fireEvent.click(await screen.findByRole("button", { name: "此引用有幫助" }));
    await screen.findByRole("button", { name: "已回饋：此引用有幫助" });
    fireEvent.click(screen.getByRole("button", { name: "關閉" }));

    fireEvent.click(screen.getAllByRole("button", { name: "檢視引用來源 1" })[1]!); // a2's citation "1"
    expect(await screen.findByRole("button", { name: "此引用有幫助" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "已回饋：此引用有幫助" })).not.toBeInTheDocument();
  });

  it("disables the citation feedback buttons while the submission is in flight", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [A1_TWO_CITATIONS] });
    let resolveSubmit!: (value: Awaited<ReturnType<typeof submitCitationFeedback>>) => void;
    mockedSubmitCitationFeedback.mockReturnValue(new Promise((resolve) => (resolveSubmit = resolve)));

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "此引用有幫助" }));

    expect(screen.getByRole("button", { name: "此引用有幫助" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "此引用不準確" })).toBeDisabled();

    resolveSubmit({ ok: true, value: { ...A1_TWO_CITATIONS, citationFeedback: { "1": "OK" } } });
    await waitFor(() => expect(screen.getByRole("button", { name: "已回饋：此引用有幫助" })).toBeInTheDocument());
  });

  it("shows an error message and keeps buttons enabled (for retry) when the citation feedback submission fails", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [A1_TWO_CITATIONS] });
    mockedSubmitCitationFeedback.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "找不到這個引用。" } });

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "此引用有幫助" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("回饋送出失敗，請再試一次。");
    expect(screen.getByRole("button", { name: "此引用有幫助" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "已回饋：此引用有幫助" })).not.toBeInTheDocument();
  });
});

/**
 * E13-S006 "feedback submission state" — see messages.test.ts's own
 * "feedback submission state composition" describe block for why this
 * story's scope is the CROSS-dimension composition proof, not a redo of
 * S001-S005's already-covered per-dimension pending/error/success states.
 * A message-level verdict submission and a citation feedback submission
 * are the one pair of dimensions that can genuinely be in flight at the
 * same time on the same message through the real UI (the reason
 * fieldset and comment textarea both only render once `feedback` is
 * already PERSISTED, not merely pending, so they can never overlap with
 * a still-pending verdict submission — see message-thread.tsx's own
 * gating conditions) — this is that composition proof.
 */
describe("MessageThread feedback submission state composition (E13-S006)", () => {
  const A1_ONE_CITATION = {
    id: "a1",
    conversationId: "c1",
    role: "assistant" as const,
    content: "本季成長 12%[1]",
    attachmentNames: [],
    createdAt: "2026-08-14T00:00:01.000Z",
  };

  it("a pending verdict submission and a pending citation feedback submission on the SAME message resolve independently, neither blocking the other's pending/disabled state", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [A1_ONE_CITATION] });
    let resolveVerdict!: (value: Awaited<ReturnType<typeof submitAnswerFeedback>>) => void;
    let resolveCitation!: (value: Awaited<ReturnType<typeof submitCitationFeedback>>) => void;
    mockedSubmitAnswerFeedback.mockReturnValue(new Promise((resolve) => (resolveVerdict = resolve)));
    mockedSubmitCitationFeedback.mockReturnValue(new Promise((resolve) => (resolveCitation = resolve)));

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));
    fireEvent.click(screen.getByRole("button", { name: "有幫助" }));
    fireEvent.click(await screen.findByRole("button", { name: "此引用有幫助" }));

    // Both submissions are in flight at once — both disabled, neither resolved yet.
    expect(screen.getByRole("button", { name: "有幫助" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "此引用有幫助" })).toBeDisabled();

    // Resolve only the citation feedback — the still-pending verdict must be unaffected.
    resolveCitation({ ok: true, value: { ...A1_ONE_CITATION, citationFeedback: { "1": "OK" } } });
    expect(await screen.findByRole("button", { name: "已回饋：此引用有幫助" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "有幫助" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "已回饋：有幫助" })).not.toBeInTheDocument();

    // Now resolve the verdict too — it settles correctly, and the already-resolved
    // citation feedback (now persisted on the message) remains untouched.
    resolveVerdict({ ok: true, value: { ...A1_ONE_CITATION, feedback: "OK", citationFeedback: { "1": "OK" } } });
    expect(await screen.findByRole("button", { name: "已回饋：有幫助" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已回饋：此引用有幫助" })).toBeInTheDocument();
  });

  it("a citation feedback submission failure shows its own error only inside the drawer, leaving the message row's own verdict feedback error-free and still submittable", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [A1_ONE_CITATION] });
    mockedSubmitCitationFeedback.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "找不到這個引用。" } });
    mockedSubmitAnswerFeedback.mockResolvedValue({
      ok: true,
      value: { ...A1_ONE_CITATION, feedback: "OK" },
    });

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "此引用有幫助" }));

    const drawer = await screen.findByRole("region", { name: "引用來源預覽" });
    expect(within(drawer).getByRole("alert")).toHaveTextContent("回饋送出失敗，請再試一次。");

    // The message row itself (outside the drawer) has no error alert of its own —
    // the citation feedback failure is scoped to the drawer, not leaked onto the
    // message-level verdict buttons' independent error-tracking state.
    const messageItem = screen.getByRole("listitem");
    expect(within(messageItem).queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(within(messageItem).getByRole("button", { name: "有幫助" }));
    expect(await within(messageItem).findByRole("button", { name: "已回饋：有幫助" })).toBeInTheDocument();
  });
});

const FIXTURE_SESSION = { userId: "u1", roles: ["general_user"], expiresAt: "2099-01-01T00:00:00.000Z" };

function renderWithSession(session: typeof FIXTURE_SESSION | null, conversationId = "c1") {
  if (session === null) {
    return render(<MessageThread conversationId={conversationId} />);
  }
  return render(
    <CurrentUserProvider value={session}>
      <MessageThread conversationId={conversationId} />
    </CurrentUserProvider>,
  );
}

describe("MessageThread usage event instrumentation (E13-S009)", () => {
  const SENT_MESSAGE = {
    id: "m1",
    conversationId: "c1",
    role: "user" as const,
    content: "你好",
    attachmentNames: [],
    createdAt: "2026-08-14T00:00:00.000Z",
  };

  it("records a conversation_message_sent usage event for the current user once a message send actually succeeds", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_MESSAGE });

    renderWithSession(FIXTURE_SESSION);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() => expect(mockedRecordUsageEvent).toHaveBeenCalledWith("conversation_message_sent", "u1"));
    // E13-S011 note: toHaveBeenCalledTimes on the whole mock would now
    // also count the co-occurring rag_answer_outcome call this same
    // send→stream flow triggers (a distinct, unrelated event sharing
    // this mock) — filtering to calls whose first arg is THIS event name
    // keeps testing the original claim ("not double-recorded") precisely,
    // without asserting something about a second event this test was
    // never about.
    expect(mockedRecordUsageEvent.mock.calls.filter((call) => call[0] === "conversation_message_sent")).toHaveLength(1);
  });

  it("does not record a usage event when the send fails", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });

    renderWithSession(FIXTURE_SESSION);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await screen.findByText("傳送失敗");
    expect(mockedRecordUsageEvent).not.toHaveBeenCalled();
  });

  it("records exactly one usage event when a retry after a failure eventually succeeds — never double-counted", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValueOnce({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });

    renderWithSession(FIXTURE_SESSION);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");
    await screen.findByText("傳送失敗");
    expect(mockedRecordUsageEvent).not.toHaveBeenCalled();

    mockedSendMessage.mockResolvedValueOnce({ ok: true, value: SENT_MESSAGE });
    fireEvent.click(screen.getByRole("button", { name: "重新傳送" }));

    // Same E13-S011 scoping note as the test above — count only THIS
    // event name's calls, since a successful send also triggers a
    // distinct rag_answer_outcome call on the same shared mock.
    await waitFor(() =>
      expect(mockedRecordUsageEvent.mock.calls.filter((call) => call[0] === "conversation_message_sent")).toHaveLength(1),
    );
    expect(mockedRecordUsageEvent).toHaveBeenCalledWith("conversation_message_sent", "u1");
  });

  it("does not record a usage event (and does not crash) when rendered outside a session provider", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_MESSAGE });

    renderWithSession(null);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() => expect(screen.queryByText("傳送中…")).not.toBeInTheDocument());
    expect(mockedRecordUsageEvent).not.toHaveBeenCalled();
  });
});

function submitViaComposerWithFile(content: string, fileName: string) {
  fireEvent.change(screen.getByLabelText("附件"), {
    target: { files: [new File(["x"], fileName, { type: "text/plain" })] },
  });
  if (content) {
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: content } });
  }
  fireEvent.click(screen.getByRole("button", { name: "送出" }));
}

describe("MessageThread file processing status (E03-S029)", () => {
  it("shows 檔案處理中… (not the generic 傳送中…) while an attached file is being processed", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSimulateFileProcessing.mockReturnValue(new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposerWithFile("你好", "報表.pdf");

    expect(screen.getByRole("status")).toHaveTextContent("檔案處理中…");
    expect(screen.queryByText("傳送中…")).not.toBeInTheDocument();
    expect(mockedSendMessage).not.toHaveBeenCalled();
  });

  it("a message with no attachments still shows the generic 傳送中…, not 檔案處理中…, and never calls simulateFileProcessing", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockReturnValue(new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    expect(screen.getByRole("status")).toHaveTextContent("傳送中…");
    expect(mockedSimulateFileProcessing).not.toHaveBeenCalled();
  });

  /**
   * 11-app-shell/phase-3 (B 類:改寫,不刪). 決定性的量沒有變(附件檔名要
   * 顯示在已送出的訊息上),變的是資料怎麼進來——送出成功後
   * `refetchAndMergeMessages()` 會用 `listMessages()` 的回傳值整批替換所有
   * 「sent」項目,原本這裡的替身固定回傳 `[]`,不含附件的那則訊息,refetch
   * 一發生就會把樂觀顯示的附件洗掉。讓 refetch 那次回傳真的帶著附件的訊息。
   */
  it("on successful processing, proceeds to call sendMessage and shows the message as sent with the attachment listed", async () => {
    const SENT_MESSAGE_WITH_ATTACHMENT = {
      id: "m1",
      conversationId: "c1",
      role: "user" as const,
      content: "你好",
      attachmentNames: ["報表.pdf"],
      createdAt: "2026-08-14T00:00:00.000Z",
    };
    mockedListMessages.mockResolvedValueOnce({ ok: true, value: [] }).mockResolvedValueOnce({ ok: true, value: [SENT_MESSAGE_WITH_ATTACHMENT] });
    mockedSimulateFileProcessing.mockResolvedValue("done");
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_MESSAGE_WITH_ATTACHMENT });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposerWithFile("你好", "報表.pdf");

    await waitFor(() => expect(mockedSendMessage).toHaveBeenCalledWith("c1", "你好", ["報表.pdf"]));
    expect(await screen.findByText("（附件：報表.pdf）")).toBeInTheDocument();
  });

  it("a filename containing the mock failure trigger shows 檔案處理失敗 with a 重新處理 button, and never calls sendMessage", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSimulateFileProcessing.mockResolvedValue("failed");

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposerWithFile("你好", `損毀${MOCK_FILE_PROCESSING_FAILURE_TRIGGER}.pdf`);

    expect(await screen.findByRole("alert")).toHaveTextContent("檔案處理失敗");
    expect(screen.getByRole("button", { name: "重新處理" })).toBeInTheDocument();
    expect(mockedSendMessage).not.toHaveBeenCalled();
  });

  it("clicking 重新處理 re-invokes file processing (not a cached prior result), and can proceed to send once it succeeds", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSimulateFileProcessing.mockResolvedValueOnce("failed").mockResolvedValueOnce("done");
    mockedSendMessage.mockResolvedValue({
      ok: true,
      value: { id: "m1", conversationId: "c1", role: "user", content: "你好", attachmentNames: ["a.pdf"], createdAt: "2026-08-14T00:00:00.000Z" },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposerWithFile("你好", "a.pdf");
    await screen.findByRole("alert");
    expect(mockedSimulateFileProcessing).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "重新處理" }));

    await waitFor(() => expect(mockedSimulateFileProcessing).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockedSendMessage).toHaveBeenCalledWith("c1", "你好", ["a.pdf"]));
  });

  it("blocks a new turn from being submitted while file processing is still in flight", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSimulateFileProcessing.mockReturnValue(new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposerWithFile("你好", "報表.pdf");

    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
  });

  it("emits file_processing attempt/success telemetry sharing one correlation id, distinct from the message-send events", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSimulateFileProcessing.mockResolvedValue("done");
    mockedSendMessage.mockResolvedValue({
      ok: true,
      value: { id: "m1", conversationId: "c1", role: "user", content: "你好", attachmentNames: ["報表.pdf"], createdAt: "2026-08-14T00:00:00.000Z" },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposerWithFile("你好", "報表.pdf");

    await waitFor(() => expect(mockedSendMessage).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "file_processing_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "file_processing_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attemptId = (attemptCall as [string, { correlationId: string }])[1].correlationId;
    const successId = (successCall as [string, { correlationId: string }])[1].correlationId;
    expect(attemptId).toBe(successId);

    // The same correlationId also covers the subsequent
    // conversation_message_send_* events (one operation, one id) — not
    // re-asserted here since that pairing is already covered by other
    // describe blocks' own telemetry tests.
  });
});

describe("MessageThread no-evidence/abstention UX (E03-S030)", () => {
  // SOURCE_BASELINE.md's own line for this story (line 1251, inside «»
  // — this document's reserved verbatim-quotation marker) gives
  // NO_EVIDENCE's exact required display sentence, missed during
  // E03-S021 (which first introduced ANSWER_STATE_FALLBACK_CONTENT)
  // and corrected here after independent review caught the gap — see
  // lib/answer-state.ts's own doc comment for the full account. Beyond
  // that correction, E03-S021 already delivers this story's named
  // capability end-to-end (classification, fallback content, badge,
  // dedicated E2E coverage). Per
  // archive/AI_KM_BMAD_High_Granularity/policies/ATOMIC_STORY_BOUNDARIES.md's
  // Scope Freeze section's explicit, unconditional prohibition on
  // "Developer 自己腦補需求 → 擴大 scope" (the AI Agent Rule's "不知道
  // 產品行為 → BLOCKED/ASSUMPTION" is related but actually permits a
  // self-adopted ASSUMPTION path — Scope Freeze is the decisive,
  // unconditional citation here), inventing new visible UI content
  // beyond what SOURCE_BASELINE actually specifies (a "try rephrasing"
  // suggestion, a link to a Knowledge Base page that doesn't exist yet
  // — E05 is 0/31 approved) would be exactly the self-invented product
  // behavior that section forbids. This
  // story's remaining increment is verifying two real interactions
  // between S21's abstention states and LATER features that didn't
  // exist yet when S21 shipped and were never cross-tested: citation
  // rendering (S13, predates S21) and Copy Answer (S27, postdates
  // S21). Full reasoning recorded via /advisor in archive/stories/E03-S030.md.
  const mockedWriteText = vi.fn();
  let originalClipboardDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    mockedWriteText.mockReset();
    originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockedWriteText },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it.each(ANSWER_STATES.filter((state) => ANSWER_STATE_FALLBACK_CONTENT[state] !== undefined))(
    "%s's fallback content never renders a citation badge, even though a normal ANSWERED reply's content always would",
    async (state) => {
      mockedListMessages.mockResolvedValue({
        ok: true,
        value: [
          SENT_USER_MESSAGE,
          {
            id: "a1",
            conversationId: "c1",
            role: "assistant",
            content: ANSWER_STATE_FALLBACK_CONTENT[state]!,
            attachmentNames: [],
            createdAt: "2026-08-14T00:00:01.000Z",
            state,
          },
        ],
      });

      render(<MessageThread conversationId="c1" />);

      await screen.findByText(ANSWER_STATE_LABELS[state]);
      // The fallback text itself never contains a literal `[N]`
      // substring (see answer-state.ts's own ANSWER_STATE_FALLBACK_CONTENT
      // doc comment) — asserting no <sup> citation marker rendered
      // proves message-content.tsx's regex-based parser genuinely finds
      // nothing to badge, not just that nobody happened to click one.
      expect(screen.queryByRole("superscript")).not.toBeInTheDocument();
    },
  );

  it("clicking 複製 on a NO_EVIDENCE reply copies its honest fallback text, not a fabricated real answer", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: ANSWER_STATE_FALLBACK_CONTENT.NO_EVIDENCE!,
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          state: "NO_EVIDENCE",
        },
      ],
    });
    mockedWriteText.mockResolvedValue(undefined);

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("查無依據");

    fireEvent.click(screen.getByRole("button", { name: "複製" }));

    await waitFor(() => expect(mockedWriteText).toHaveBeenCalledWith(ANSWER_STATE_FALLBACK_CONTENT.NO_EVIDENCE));
    expect(await screen.findByRole("button", { name: "已複製" })).toBeInTheDocument();
  });
});

// 11-app-shell/phase-3. 整個 describe 刪掉(不是改寫)——`shouldSimulateStreamDisconnect`
// 是跟 `classifyAnswerState` 同一種形狀的 mock 觸發器(見 lib/streaming.ts
// 自己的文件:「same as E03-S021's MOCK_ANSWER_STATE_TRIGGERS ... a
// deterministic, honestly-labeled mock trigger」),從送出的問題文字判斷要
// 不要模擬連線中斷,而它唯一的呼叫點就在被移除的
// `startStream(classifyAnswerState(content), shouldSimulateStreamDisconnect(content))`
// 那一行(message-thread.tsx 的 import 也整個拿掉了這個函式)。
//
// 與 E03-S021 的六個 AnswerState 不同,「要不要中斷」這個判斷結果沒有像
// `originalMessage.state` 一樣被存在任何持久化的 Message 欄位上,所以
// handleRegenerate/handleRetryStream/handleReconnect 沒有任何管道可以重新
// 餵給它——handleRegenerate 呼叫 `runStream(localId, originalMessage,
// originalMessage.state ?? "ANSWERED")`,四個參數位置沒有第四個
// simulateDisconnect;handleReconnect 本身雖然會傳 `true`,但只有已經進入
// `stream-disconnected` 狀態才會出現「重新連線」按鈕可以點——而進入那個狀態
// 唯一的路徑正是這裡要刪的那個。也就是說,不是換個觸發動作就能重現這五條
// 測試的情境,是「連線中斷模擬」這個機制在移除送出時的本地生成之後,已經是
// 沒有任何活路徑能進入的死碼(runStream 裡處理 disconnect 的 catch 分支、
// `stream-disconnected` 的渲染、「重新連線」按鈕都還在,只是沒有東西能再
// 觸發它們)。
//
// 這不代表「連線中斷/重新連線」這個產品概念本身不重要——只是今天這整套都是
// 用問題文字模擬的 demo 機制,ADR 0017 第二步明確裁定要移除的正是這一整條「從
// 問題文字判斷行為」的路。若未來要支援真正的連線中斷重試,需要一個新的、
// 綁在真實傳輸層或已持久化資料上的觸發方式,那會是新故事,不是這裡能改寫
// 出來的。

describe("MessageThread message retry UX (E03-S032)", () => {
  it("retrying a stream-failed regenerate revises the same original message again — it does not fall through to creating a brand new one", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "舊的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "重試前的內容";
    });
    mockedReviseMessage.mockResolvedValueOnce({ ok: false, error: { code: "NOT_FOUND", message: "找不到這則訊息。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");
    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    expect(await screen.findByText("AI 回覆失敗")).toBeInTheDocument();
    // The failed attempt already went through reviseMessage (not
    // receiveAssistantReply) — same finalize path the passing "重新產生
    // revises in place" test (E03-S020 above) asserts for the success
    // case; this is the failure-path counterpart of that same call.
    expect(mockedReceiveAssistantReply).not.toHaveBeenCalled();

    mockedReviseMessage.mockResolvedValueOnce({
      ok: true,
      value: {
        id: "a1",
        conversationId: "c1",
        role: "assistant",
        content: "重試後的修訂",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:01.000Z",
        revisions: ["舊的回覆"],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "重新產生回覆" }));

    // A genuinely second call, updating the SAME message id "a1" again
    // — this is the actual bug this story fixes: without reviseTarget
    // threaded through handleRetryStream, this call would never happen
    // at all, and receiveAssistantReply would fire instead, minting a
    // brand new message rather than updating "a1".
    await waitFor(() => expect(mockedReviseMessage).toHaveBeenCalledTimes(2));
    expect(mockedReviseMessage.mock.calls[1]?.[0]).toBe("a1");
    expect(mockedReceiveAssistantReply).not.toHaveBeenCalled();
    expect(await screen.findByText("重試後的修訂")).toBeInTheDocument();
    // The `not.toHaveBeenCalled()`/call-count assertions above are what
    // actually prove no duplicate backend message was minted — this
    // listitem count is a supplementary sanity check, not independent
    // proof by itself: `displayMessages` always updates the SAME array
    // slot in place by localId regardless of which persistence function
    // fired, so the count alone would stay 2 even under the old buggy
    // behavior (it would just be 2 the wrong way, holding the newly
    // minted message's content instead of "a1"'s).
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  /**
   * 11-app-shell/phase-3 (B 類:改寫,不刪). 原題是「送出一個新回合、classify
   * 成 PARTIAL、串流失敗、重試」——送出已經不再 classify 或串流(見 E03-S010
   * describe 開頭的說明),這個「NEW 回合」的情境本身不可能再發生。但它要守
   * 的決定性行為(重試失敗的串流時,原本的非 ANSWERED 分類要原封不動延續到
   * 下一次呼叫,不能悄悄退回 ANSWERED)完全可以透過「重新產生」重現——差別
   * 只在於這裡的原始分類來自一則已結算訊息自己的 `state` 欄位
   * (`originalMessage.state ?? "ANSWERED"`,E03-S021 已經確立的機制),不是
   * 從送出的文字現場分類出來的。
   */
  it("retrying a stream-failed regeneration preserves the original message's non-ANSWERED state instead of silently resetting to ANSWERED", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "舊的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          state: "PARTIAL",
        },
      ],
    });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "部分回覆內容";
    });
    mockedReviseMessage.mockResolvedValueOnce({ ok: false, error: { code: "NOT_FOUND", message: "找不到這則訊息。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");
    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    expect(await screen.findByText("AI 回覆失敗")).toBeInTheDocument();
    // 第一次呼叫就已經延續了 "a1" 自己的 state,不是重試之後才對——先確認
    // 起點是對的,重試才有意義比較「有沒有變」。
    expect(mockedReviseMessage.mock.calls[0]?.[2]).toBe("PARTIAL");

    mockedReviseMessage.mockResolvedValueOnce({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content: "部分回覆內容", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", state: "PARTIAL" },
    });
    fireEvent.click(screen.getByRole("button", { name: "重新產生回覆" }));

    await waitFor(() => expect(mockedReviseMessage).toHaveBeenCalledTimes(2));
    // The bug this guards: without answerState threaded through the
    // retry, this 3rd arg would silently read "ANSWERED" instead,
    // regardless of what the original message was actually classified as.
    expect(mockedReviseMessage.mock.calls[1]?.[2]).toBe("PARTIAL");
    // Genuinely re-streamed (not just replaying cached text) — same
    // "actually re-attempted" precedent the pre-existing stream-failed
    // retry tests already establish.
    expect(mockedStreamAssistantReply).toHaveBeenCalledTimes(2);
  });
});

describe("MessageThread RAG outcome analytics (E13-S011)", () => {
  const SENT_MESSAGE = {
    id: "m1",
    conversationId: "c1",
    role: "user" as const,
    content: "你好",
    attachmentNames: [],
    createdAt: "2026-08-14T00:00:00.000Z",
  };

  /**
   * 11-app-shell/phase-3 round 2 (B 類:改寫,不刪). `3166064` 把
   * `recordUsageEvent("rag_answer_outcome", …)` 的落點從 `runStream()`
   * 搬到 `attemptSend` 的 `refetchAndMergeMessages(onMerged)` ——`onMerged`
   * 拿到 refetch 回來的完整列表,找出「這個分頁送出前不認識的助理訊息」來
   * 記錄。這 5 條原本靠 `mockedReceiveAssistantReply` 餵助理訊息,但送出
   * 已經不再呼叫這個函式(對這段程式碼是盲的,見 `3166064` commit body 的
   * A/B 實測)——改成讓 `mockedListMessages` 的第二次呼叫(送出後的
   * refetch)回傳「使用者訊息 + 伺服器產生的助理訊息」。斷言內容
   * (`answerState`/`citationCount`/`latencyMs` 的期望值、`toHaveBeenCalledWith`
   * 的形狀)一個字沒動。
   */
  it("records a rag_answer_outcome event with the finalized answerState and citation count once an answer is actually persisted", async () => {
    mockedListMessages.mockResolvedValueOnce({ ok: true, value: [] }).mockResolvedValueOnce({
      ok: true,
      value: [SENT_MESSAGE, { ...DEFAULT_ASSISTANT_MESSAGE, content: "第一個來源 [1]，第二個來源 [2]。", state: "ANSWERED" }],
    });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_MESSAGE });

    renderWithSession(FIXTURE_SESSION);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() =>
      expect(mockedRecordUsageEvent).toHaveBeenCalledWith("rag_answer_outcome", "u1", { answerState: "ANSWERED", citationCount: 2, latencyMs: expect.any(Number) }),
    );
  });

  it("records rag_answer_outcome exactly once for a single successfully-persisted answer — never double-counted", async () => {
    // toHaveBeenCalledWith above only proves ONE call matched these args —
    // it says nothing about whether rag_answer_outcome was ALSO recorded
    // a second (or third) time for the same answer. Filtering to this
    // event name specifically (same precision the S009 tests already use
    // for conversation_message_sent, and the same technique this story's
    // own EVIDENCE documents applying to those existing tests) is what
    // actually proves no duplicate side effect for THIS event.
    mockedListMessages.mockResolvedValueOnce({ ok: true, value: [] }).mockResolvedValueOnce({
      ok: true,
      value: [SENT_MESSAGE, { ...DEFAULT_ASSISTANT_MESSAGE, content: "唯一的一個來源 [1]。", state: "ANSWERED" }],
    });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_MESSAGE });

    renderWithSession(FIXTURE_SESSION);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() =>
      expect(mockedRecordUsageEvent.mock.calls.filter((call) => call[0] === "rag_answer_outcome")).toHaveLength(1),
    );
  });

  it("records citationCount 0 for an answer with no citation markers", async () => {
    mockedListMessages.mockResolvedValueOnce({ ok: true, value: [] }).mockResolvedValueOnce({
      ok: true,
      value: [SENT_MESSAGE, { ...DEFAULT_ASSISTANT_MESSAGE, content: "沒有引用來源的回答。", state: "ANSWERED" }],
    });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_MESSAGE });

    renderWithSession(FIXTURE_SESSION);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() =>
      expect(mockedRecordUsageEvent).toHaveBeenCalledWith("rag_answer_outcome", "u1", { answerState: "ANSWERED", citationCount: 0, latencyMs: expect.any(Number) }),
    );
  });

  // 送出的問題文字不再影響任何分類——伺服器直接決定這則助理訊息的
  // state,所以這裡不再需要 MOCK_ANSWER_STATE_TRIGGERS 的觸發字串,直接讓
  // 替身的 state 就是 NO_EVIDENCE。
  it("records the answer's real non-ANSWERED classification (e.g. NO_EVIDENCE) rather than defaulting to ANSWERED", async () => {
    mockedListMessages.mockResolvedValueOnce({ ok: true, value: [] }).mockResolvedValueOnce({
      ok: true,
      value: [SENT_MESSAGE, { ...DEFAULT_ASSISTANT_MESSAGE, content: "（模擬回覆）找不到足夠企業資料支持此答案。", state: "NO_EVIDENCE" }],
    });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_MESSAGE });

    renderWithSession(FIXTURE_SESSION);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("保固期限是多久？");

    await waitFor(() =>
      expect(mockedRecordUsageEvent).toHaveBeenCalledWith("rag_answer_outcome", "u1", { answerState: "NO_EVIDENCE", citationCount: 0, latencyMs: expect.any(Number) }),
    );
  });

  // 「持久化失敗」原本是 receiveAssistantReply() 回 ok:false——那個呼叫點
  // 已經不存在。送出這條路唯一對應的「還沒有答案」情境,是 refetch 拿到的
  // 列表裡還沒出現任何新助理訊息(伺服器還沒產生,或這個分頁還不知道)——
  // `onMerged` 找不到「送出前不認識的助理訊息」就不會記錄,決定性斷言
  // (不會呼叫 rag_answer_outcome)不變。
  it("does not record a rag_answer_outcome event when the refetch after sending doesn't (yet) show a new assistant reply", async () => {
    mockedListMessages.mockResolvedValueOnce({ ok: true, value: [] }).mockResolvedValueOnce({ ok: true, value: [SENT_MESSAGE] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_MESSAGE });

    renderWithSession(FIXTURE_SESSION);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    // 確保第二次(refetch 那次)listMessages() 呼叫已經發生且 resolve
    // 過——mockResolvedValueOnce 立即 resolve,microtask 會在下一個
    // waitFor 輪詢前排空,所以這是「onMerged 已經跑過」的可靠代理。
    await waitFor(() => expect(mockedListMessages).toHaveBeenCalledTimes(2));
    expect(mockedRecordUsageEvent).not.toHaveBeenCalledWith("rag_answer_outcome", expect.anything(), expect.anything());
  });

  it("does not record a rag_answer_outcome event (and does not crash) when rendered outside a session provider", async () => {
    mockedListMessages.mockResolvedValueOnce({ ok: true, value: [] }).mockResolvedValueOnce({
      ok: true,
      value: [SENT_MESSAGE, { ...DEFAULT_ASSISTANT_MESSAGE, content: "回答 [1]" }],
    });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_MESSAGE });

    renderWithSession(null);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() => expect(screen.queryByText("傳送中…")).not.toBeInTheDocument());
    expect(mockedRecordUsageEvent).not.toHaveBeenCalledWith("rag_answer_outcome", expect.anything(), expect.anything());
  });

  it("records its own rag_answer_outcome event for a regenerated reply (via 重新產生, in-place update)", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [{ id: "a1", conversationId: "c1", role: "assistant" as const, content: "原始回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" }],
    });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "重新產生的回覆，引用了一個來源 [1]。";
    });
    mockedReviseMessage.mockResolvedValue({
      ok: true,
      value: {
        id: "a1",
        conversationId: "c1",
        role: "assistant",
        content: "重新產生的回覆，引用了一個來源 [1]。",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:01.000Z",
        revisions: ["原始回覆"],
      },
    });

    renderWithSession(FIXTURE_SESSION);
    await screen.findByText("原始回覆");
    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    await waitFor(() =>
      expect(mockedRecordUsageEvent).toHaveBeenCalledWith("rag_answer_outcome", "u1", { answerState: "ANSWERED", citationCount: 1, latencyMs: expect.any(Number) }),
    );
  });
});

describe("MessageThread latency instrumentation (E13-S013)", () => {
  const SENT_MESSAGE = {
    id: "m1",
    conversationId: "c1",
    role: "user" as const,
    content: "你好",
    attachmentNames: [],
    createdAt: "2026-08-14T00:00:00.000Z",
  };

  // 11-app-shell/phase-3 round 2 (B 類:改寫,不刪,理由與 E13-S011 相同)。
  it("records a non-negative latencyMs reflecting real elapsed time, not a hardcoded placeholder", async () => {
    mockedListMessages.mockResolvedValueOnce({ ok: true, value: [] }).mockResolvedValueOnce({
      ok: true,
      value: [SENT_MESSAGE, { ...DEFAULT_ASSISTANT_MESSAGE, content: "回答內容 [1]", state: "ANSWERED" }],
    });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_MESSAGE });

    renderWithSession(FIXTURE_SESSION);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() => expect(mockedRecordUsageEvent).toHaveBeenCalledWith("rag_answer_outcome", expect.anything(), expect.anything()));
    const call = mockedRecordUsageEvent.mock.calls.find((call) => call[0] === "rag_answer_outcome");
    if (!call) throw new Error("expected a rag_answer_outcome call");
    const details = call[2] as { latencyMs?: number };
    expect(typeof details.latencyMs).toBe("number");
    expect(details.latencyMs).toBeGreaterThanOrEqual(0);
  });

  /**
   * 11-app-shell/phase-3 round 2 (B 類:改寫,不刪). `latencyMs` 現在量的是
   * `sendStartedAt`(attemptSend 裡 sendMessage() resolve 之後)到
   * `onMerged` 找到新助理訊息那一刻(見 `3166064` commit body)——不再是
   * `streamAssistantReply` 的本地串流耗時,因為送出已經不再呼叫它。原本
   * 用 `streamAssistantReply` 人工延遲 40ms 來證明「這是真的量測,不是寫死
   * 的 0」,現在改成延遲 refetch 那次 `listMessages()` 的 resolve
   * 時間——決定性斷言(`latencyMs >= 35`)不變。
   */
  it("measures a distinctly longer latencyMs when the arrival of the server's reply is artificially delayed, proving this is a real measurement rather than an always-zero stub", async () => {
    mockedListMessages.mockResolvedValueOnce({ ok: true, value: [] }).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                ok: true,
                value: [SENT_MESSAGE, { ...DEFAULT_ASSISTANT_MESSAGE, content: "延遲後的回答 [1]", state: "ANSWERED" }],
              }),
            40,
          );
        }),
    );
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_MESSAGE });

    renderWithSession(FIXTURE_SESSION);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() => expect(mockedRecordUsageEvent).toHaveBeenCalledWith("rag_answer_outcome", expect.anything(), expect.anything()), {
      timeout: 2000,
    });
    const call = mockedRecordUsageEvent.mock.calls.find((call) => call[0] === "rag_answer_outcome");
    if (!call) throw new Error("expected a rag_answer_outcome call");
    const details = call[2] as { latencyMs?: number };
    expect(details.latencyMs).toBeGreaterThanOrEqual(35);
  });
});

describe("MessageThread feedback-to-knowledge-candidate flow (E13-S015)", () => {
  const DEFAULT_QUALIFYING_MESSAGE: {
    id: string;
    conversationId: string;
    role: "assistant";
    content: string;
    attachmentNames: string[];
    createdAt: string;
    feedback: AnswerFeedbackVerdict;
    feedbackReason: FeedbackReason;
    feedbackComment: string;
  } = {
    id: "a1",
    conversationId: "c1",
    role: "assistant",
    content: "第一輪回覆",
    attachmentNames: [],
    createdAt: "2026-08-18T00:00:01.000Z",
    feedback: "NG",
    feedbackReason: "INCORRECT",
    feedbackComment: "答案裡的日期是錯的",
  };

  function qualifyingMessage(overrides: Partial<typeof DEFAULT_QUALIFYING_MESSAGE> = {}) {
    return { ...DEFAULT_QUALIFYING_MESSAGE, ...overrides };
  }

  it("does not render the flag button before NG feedback has been given", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [SENT_USER_MESSAGE, { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" }],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.queryByRole("button", { name: "標記為知識落差候選" })).not.toBeInTheDocument();
  });

  it("does not render the flag button for OK feedback, even with a comment", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [SENT_USER_MESSAGE, qualifyingMessage({ feedback: "OK", feedbackReason: undefined as unknown as FeedbackReason, feedbackComment: "特別有幫助" })],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.queryByRole("button", { name: "標記為知識落差候選" })).not.toBeInTheDocument();
  });

  it("does not render the flag button for NG feedback with a reason but no comment yet", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [SENT_USER_MESSAGE, qualifyingMessage({ feedbackComment: undefined as unknown as string })],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.queryByRole("button", { name: "標記為知識落差候選" })).not.toBeInTheDocument();
  });

  it("renders an enabled flag button once NG feedback + reason + comment are all present", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, qualifyingMessage()] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByRole("button", { name: "標記為知識落差候選" })).toBeEnabled();
  });

  it("clicking the flag button submits the candidate and locks the button afterward", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, qualifyingMessage()] });
    mockedSubmitFeedbackKnowledgeCandidate.mockResolvedValue({
      ok: true,
      value: {
        id: "kc1",
        sourceMessageId: "a1",
        conversationId: "c1",
        answerContent: "第一輪回覆",
        reason: "INCORRECT",
        comment: "答案裡的日期是錯的",
        createdAt: "2026-08-18T00:00:02.000Z",
      },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "標記為知識落差候選" }));

    await waitFor(() => expect(mockedSubmitFeedbackKnowledgeCandidate).toHaveBeenCalledWith(qualifyingMessage()));
    await waitFor(() => expect(screen.getByRole("button", { name: "已標記為知識落差候選" })).toBeDisabled());
  });

  it("clicking the already-disabled flag button after a candidate is recorded does not submit again", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, qualifyingMessage()] });
    mockedSubmitFeedbackKnowledgeCandidate.mockResolvedValue({
      ok: true,
      value: {
        id: "kc1",
        sourceMessageId: "a1",
        conversationId: "c1",
        answerContent: "第一輪回覆",
        reason: "INCORRECT",
        comment: "答案裡的日期是錯的",
        createdAt: "2026-08-18T00:00:02.000Z",
      },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "標記為知識落差候選" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "已標記為知識落差候選" })).toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: "已標記為知識落差候選" }));
    expect(mockedSubmitFeedbackKnowledgeCandidate).toHaveBeenCalledTimes(1);
  });

  it("shows a distinct error message and re-enables the flag button (for retry) when submission fails", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, qualifyingMessage()] });
    mockedSubmitFeedbackKnowledgeCandidate.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "請先填寫留言說明。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "標記為知識落差候選" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("標記失敗，請再試一次。");
    expect(screen.getByRole("button", { name: "標記為知識落差候選" })).toBeEnabled();
  });

  it("disables the flag button while submission is in flight", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, qualifyingMessage()] });
    let resolveSubmit!: (value: Awaited<ReturnType<typeof submitFeedbackKnowledgeCandidate>>) => void;
    mockedSubmitFeedbackKnowledgeCandidate.mockReturnValue(new Promise((resolve) => (resolveSubmit = resolve)));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "標記為知識落差候選" }));

    expect(screen.getByRole("button", { name: "標記為知識落差候選" })).toBeDisabled();

    resolveSubmit({
      ok: true,
      value: {
        id: "kc1",
        sourceMessageId: "a1",
        conversationId: "c1",
        answerContent: "第一輪回覆",
        reason: "INCORRECT",
        comment: "答案裡的日期是錯的",
        createdAt: "2026-08-18T00:00:02.000Z",
      },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "已標記為知識落差候選" })).toBeDisabled());
  });

  it("flagging one message's candidate does not affect a different message's flag button", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        qualifyingMessage({ id: "a1", content: "第一輪回覆" }),
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-18T00:00:02.000Z" },
        qualifyingMessage({ id: "a2", content: "第二輪回覆", createdAt: "2026-08-18T00:00:03.000Z" }),
      ],
    });
    mockedSubmitFeedbackKnowledgeCandidate.mockResolvedValue({
      ok: true,
      value: {
        id: "kc1",
        sourceMessageId: "a1",
        conversationId: "c1",
        answerContent: "第一輪回覆",
        reason: "INCORRECT",
        comment: "答案裡的日期是錯的",
        createdAt: "2026-08-18T00:00:02.000Z",
      },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第二輪回覆");

    const items = screen.getAllByRole("listitem");
    fireEvent.click(within(items[1]!).getByRole("button", { name: "標記為知識落差候選" }));

    await waitFor(() => expect(within(items[1]!).getByRole("button", { name: "已標記為知識落差候選" })).toBeDisabled());
    // a2's flag button: completely untouched, still enabled.
    expect(within(items[3]!).getByRole("button", { name: "標記為知識落差候選" })).toBeEnabled();
  });

  it("shows an already-locked flag button on initial load when a candidate was already flagged in a prior session (survives remount, not just local state)", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, qualifyingMessage()] });
    mockedListFeedbackKnowledgeCandidates.mockReturnValue([
      {
        id: "kc1",
        sourceMessageId: "a1",
        conversationId: "c1",
        answerContent: "第一輪回覆",
        reason: "INCORRECT",
        comment: "答案裡的日期是錯的",
        createdAt: "2026-08-18T00:00:02.000Z",
      },
    ]);

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByRole("button", { name: "已標記為知識落差候選" })).toBeDisabled();
    expect(mockedSubmitFeedbackKnowledgeCandidate).not.toHaveBeenCalled();
  });

  it("does not lock the flag button for a candidate belonging to a different conversation", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, qualifyingMessage()] });
    mockedListFeedbackKnowledgeCandidates.mockReturnValue([
      {
        id: "kc-other",
        sourceMessageId: "a1",
        conversationId: "some-other-conversation",
        answerContent: "不同對話的回覆",
        reason: "OFF_TOPIC",
        comment: "不相關的說明",
        createdAt: "2026-08-18T00:00:02.000Z",
      },
    ]);

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByRole("button", { name: "標記為知識落差候選" })).toBeEnabled();
  });
});

describe("MessageThread: cross-window sync (E03-S039, AC3/AC5, regression)", () => {
  function makeFakeSource(): ConversationEventSourceLike & { emit(event: ConversationEvent): void } {
    const changeHandlers = new Set<(event: ConversationEvent) => void>();
    return {
      subscribe(handler) {
        changeHandlers.add(handler);
        return () => changeHandlers.delete(handler);
      },
      onStatusChange: (_handler: (status: ConnectionStatus) => void) => () => {},
      status: () => "open",
      close: vi.fn(),
      emit(event) {
        for (const handler of changeHandlers) handler(event);
      },
    };
  }

  function renderThreadWithEvents(source: ReturnType<typeof makeFakeSource>, conversationId = "c1") {
    return render(
      <ConversationEventsProvider source={source}>
        <MessageThread conversationId={conversationId} />
      </ConversationEventsProvider>,
    );
  }

  const OTHER_MESSAGE = {
    id: "m2",
    conversationId: "c1",
    role: "user" as const,
    content: "另一視窗傳來的訊息",
    attachmentNames: [],
    createdAt: "2026-08-14T00:01:00.000Z",
  };

  it("AC3: refetches and shows the new message on a message.created event from ANOTHER tab", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE] });
    const source = makeFakeSource();

    renderThreadWithEvents(source);
    await screen.findByText("你好");
    const callsBeforeEvent = mockedListMessages.mock.calls.length;

    mockedListMessages.mockResolvedValueOnce({ ok: true, value: [SENT_USER_MESSAGE, OTHER_MESSAGE] });
    act(() => {
      source.emit({ id: 1, type: "message.created", conversationId: "c1", messageId: "m2", occurredAt: new Date().toISOString(), originClientId: "some-other-tab" });
    });

    expect(await screen.findByText("另一視窗傳來的訊息")).toBeInTheDocument();
    expect(mockedListMessages.mock.calls.length).toBeGreaterThan(callsBeforeEvent);
  });

  it("AC3: does NOT refetch when originClientId matches this tab's own client id", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE] });
    const source = makeFakeSource();

    renderThreadWithEvents(source);
    await screen.findByText("你好");
    const callsBeforeEvent = mockedListMessages.mock.calls.length;

    act(() => {
      source.emit({ id: 1, type: "message.created", conversationId: "c1", messageId: "m2", occurredAt: new Date().toISOString(), originClientId: apiClient.clientId });
    });

    expect(mockedListMessages.mock.calls.length).toBe(callsBeforeEvent);
  });

  it("ignores a message.created event for a DIFFERENT conversationId", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE] });
    const source = makeFakeSource();

    renderThreadWithEvents(source);
    await screen.findByText("你好");
    const callsBeforeEvent = mockedListMessages.mock.calls.length;

    act(() => {
      source.emit({
        id: 1,
        type: "message.created",
        conversationId: "some-other-conversation",
        messageId: "m2",
        occurredAt: new Date().toISOString(),
        originClientId: "some-other-tab",
      });
    });

    expect(mockedListMessages.mock.calls.length).toBe(callsBeforeEvent);
  });

  it("AC5: refetches unconditionally on a resync frame, even with no originClientId to compare", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE] });
    const source = makeFakeSource();

    renderThreadWithEvents(source);
    await screen.findByText("你好");
    const callsBeforeEvent = mockedListMessages.mock.calls.length;

    act(() => {
      source.emit({ type: "resync", reason: "EVENT_LOG_TRUNCATED" });
    });

    await waitFor(() => expect(mockedListMessages.mock.calls.length).toBeGreaterThan(callsBeforeEvent));
  });

  /**
   * 11-app-shell/phase-3 (B 類:改寫,**不准刪**——技術顧問 ai-km-1b 指名
   * 這是一個具名回歸的守門)。決定性的量沒有變:本分頁自己的事件回音在
   * 串流中途抵達時,不能觸發重抓、不能打斷正在累積的內容。原本靠「送出」
   * 進入串流狀態,但送出已經不再觸發任何本地串流(見 E03-S010 describe
   * 開頭的說明);唯一還能進入串流狀態的動作是「重新產生」,回音事件也
   * 對應換成 `message.updated`(reviseMessage 更新的是既有訊息,不是新增
   * 一則,所以真實情境下這裡的回音會是 updated 不是 created——見
   * isOwnClientEvent 的呼叫端同時處理兩種事件型別,守門邏輯本身沒有變)。
   */
  it("Regression (Test Obligations: 本分頁事件造成重抓打斷串流): an own-tab message.updated event during an active regeneration must not refetch or disturb the in-flight streaming entry", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "舊的回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "第";
      yield "一";
      await gate;
      yield "段";
    });
    mockedReviseMessage.mockResolvedValue({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content: "第一段", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", revisions: ["舊的回覆"] },
    });
    const source = makeFakeSource();

    renderThreadWithEvents(source);
    await screen.findByText("舊的回覆");
    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));
    await waitFor(() => expect(screen.getByText("第一")).toBeInTheDocument());
    const callsBeforeEvent = mockedListMessages.mock.calls.length;

    // This tab's own message.updated echo (from the reviseMessage this
    // regeneration will eventually call) arrives on the SSE stream while
    // the reply is still mid-flight.
    act(() => {
      source.emit({ id: 1, type: "message.updated", conversationId: "c1", messageId: "a1", occurredAt: new Date().toISOString(), originClientId: apiClient.clientId });
    });

    expect(mockedListMessages.mock.calls.length).toBe(callsBeforeEvent);
    expect(screen.getByText("第一")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("AI 回覆中…");

    releaseGate();
    await waitFor(() => expect(mockedReviseMessage).toHaveBeenCalledWith("a1", "第一段", "ANSWERED"));
  });
});
