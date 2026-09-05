import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MessageThread } from "./message-thread";
import { ConversationRelatedPanel } from "./conversation-related-panel";
// Namespace import, NOT mocked (same reasoning message-thread.test.tsx already
// documents for its own resolveAnswerStateDisplay spy): this file needs to
// prove classifyAnswerState is never reached once a send succeeds, and a spy
// can only wrap a real, unmocked export.
import * as answerStateModule from "@/lib/answer-state";
import { listFeedbackKnowledgeCandidates } from "@/lib/feedback-knowledge-candidates";
import { runGenerationPhases } from "@/lib/generation-status";
import { listMessages, sendMessage, type Message } from "@/lib/messages";
import { shouldSimulateStreamDisconnect, streamAssistantReply } from "@/lib/streaming";
import { simulateFileProcessing } from "@/lib/file-processing";
import { trackEvent } from "@/lib/telemetry";

/**
 * 11-app-shell/phase-3 (顧問裁決,2026-09-05). 坑 19 第三次擋住的那一層:
 * apps/web 的 message-thread.tsx 在 sendMessage() 成功之後,無條件呼叫
 * startStream(classifyAnswerState(content), …) —— 本地跑一段固定的 MOCK_REPLY,
 * 把 03-conversation/phase-2 已經讓伺服器自動產生的、帶真引用的助理回覆整個丟掉。
 *
 * 這個檔案只斷言使用者看得到的兩個值(顧問指定的守門形狀):
 *   A. 助理氣泡的文字 === 伺服器那則訊息的 content(不是「有文字」)
 *   B. 引用面板的列數 === 伺服器那則訊息 citations 陣列的長度(不是「有引用」)
 * 加一條獨立的「沒有偷用本地模擬」防呆(C):classifyAnswerState 與
 * streamAssistantReply 都不該再被呼叫。
 *
 * `citations` 是這裡刻意加在 fixture 上、但今天 `@/lib/messages` 的 `Message`
 * 介面還沒宣告的欄位(ADR 0016 的契約早就有,前端型別還沒對齊)——用一個沒有
 * 顯式 `Message`型別標注的 const 承載它,指派進 `Message[]` 時就不會觸發
 * TypeScript 的 excess-property 檢查(那隻檢查只認「就地字面量」,不認「先賦值
 * 給一個變數,再把變數放進去」),所以 `pnpm typecheck` 綠,紅只會紅在斷言。
 * 引用面板今天讀的是 content 裡 [N] 記號解析出來的 id(ADR 0016 D2:marker
 * 順序 = citations[] 順序),不是這個欄位本身——這裡刻意讓兩者的數字一致
 * (兩個 marker、citations 陣列長度也是 2),斷言仍然寫成
 * `SERVER_ASSISTANT_MESSAGE.citations.length`,而不是寫死的數字 2:哪天面板
 * 真的改成直接讀 `.citations`,這條斷言不必跟著改。
 */

vi.mock("@/lib/messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/messages")>();
  return {
    ...actual,
    listMessages: vi.fn(),
    sendMessage: vi.fn(),
  };
});

vi.mock("@/lib/streaming", () => ({
  streamAssistantReply: vi.fn(),
  shouldSimulateStreamDisconnect: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/generation-status", () => ({
  GENERATION_PHASE_LABELS: {
    searching: "搜尋中…",
    reading: "讀取中…",
    generating: "生成中…",
  },
  runGenerationPhases: vi.fn(),
}));

vi.mock("@/lib/file-processing", () => ({
  MOCK_FILE_PROCESSING_FAILURE_TRIGGER: "[模擬:PROCESSING_FAILED]",
  simulateFileProcessing: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@/lib/feedback-knowledge-candidates", () => ({
  submitFeedbackKnowledgeCandidate: vi.fn(),
  listFeedbackKnowledgeCandidates: vi.fn(),
}));

const mockedListMessages = vi.mocked(listMessages);
const mockedSendMessage = vi.mocked(sendMessage);
const mockedStreamAssistantReply = vi.mocked(streamAssistantReply);
const mockedShouldSimulateStreamDisconnect = vi.mocked(shouldSimulateStreamDisconnect);
const mockedRunGenerationPhases = vi.mocked(runGenerationPhases);
const mockedSimulateFileProcessing = vi.mocked(simulateFileProcessing);
const mockedTrackEvent = vi.mocked(trackEvent);
const mockedListFeedbackKnowledgeCandidates = vi.mocked(listFeedbackKnowledgeCandidates);

const USER_QUESTION = "保固期限是多久？";

const SENT_USER_MESSAGE: Message = {
  id: "u-server-answer-1",
  conversationId: "c1",
  role: "user",
  content: USER_QUESTION,
  attachmentNames: [],
  createdAt: "2026-09-05T00:00:00.000Z",
};

const SERVER_ASSISTANT_CONTENT = "依保固條款，保固期限為兩年，詳見 [1] 與 [2]。";

// 刻意不標成 `: Message`——見檔頭說明,這樣 `citations` 才不會被當場字面量
// excess-property 檢查擋下來。
const SERVER_ASSISTANT_MESSAGE = {
  id: "a-server-answer-1",
  conversationId: "c1",
  role: "assistant" as const,
  content: SERVER_ASSISTANT_CONTENT,
  attachmentNames: [] as string[],
  createdAt: "2026-09-05T00:00:01.000Z",
  citations: [
    { documentId: "doc-1", startOffset: 0, endOffset: 12 },
    { documentId: "doc-2", startOffset: 0, endOffset: 12 },
  ],
};

function submitViaComposer(content: string) {
  fireEvent.change(screen.getByLabelText("訊息"), { target: { value: content } });
  fireEvent.click(screen.getByRole("button", { name: "送出" }));
}

function submitViaComposerWithFile(content: string, fileName: string) {
  fireEvent.change(screen.getByLabelText("附件"), {
    target: { files: [new File(["x"], fileName, { type: "text/plain" })] },
  });
  if (content) {
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: content } });
  }
  fireEvent.click(screen.getByRole("button", { name: "送出" }));
}

beforeEach(() => {
  mockedListMessages.mockReset();
  mockedSendMessage.mockReset();
  mockedStreamAssistantReply.mockReset();
  mockedShouldSimulateStreamDisconnect.mockReset();
  mockedShouldSimulateStreamDisconnect.mockReturnValue(false);
  mockedRunGenerationPhases.mockReset();
  mockedRunGenerationPhases.mockImplementation(async function* () {
    return;
  });
  mockedStreamAssistantReply.mockImplementation(async function* () {
    return;
  });
  mockedSimulateFileProcessing.mockReset();
  mockedSimulateFileProcessing.mockResolvedValue("done");
  mockedTrackEvent.mockReset();
  mockedListFeedbackKnowledgeCandidates.mockReset();
  mockedListFeedbackKnowledgeCandidates.mockReturnValue([]);
});

describe("MessageThread shows the server's own answer (11-app-shell/phase-3, ADR 0017)", () => {
  let classifyAnswerStateSpy: MockInstance<typeof answerStateModule.classifyAnswerState>;

  beforeEach(() => {
    classifyAnswerStateSpy = vi.spyOn(answerStateModule, "classifyAnswerState");
  });

  afterEach(() => {
    classifyAnswerStateSpy.mockRestore();
  });

  it("shows the assistant's real server-generated reply, not a local mock stream", async () => {
    let sent = false;
    mockedListMessages.mockImplementation(() =>
      Promise.resolve({ ok: true, value: sent ? [SENT_USER_MESSAGE, SERVER_ASSISTANT_MESSAGE] : [] }),
    );
    mockedSendMessage.mockImplementation(async () => {
      sent = true;
      return { ok: true, value: SENT_USER_MESSAGE };
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");

    submitViaComposer(USER_QUESTION);

    // 決定性的量:氣泡文字要逐字等於伺服器那則訊息的 content——不是「有沒有
    // 出現任何助理回覆」。如果實作沒被修好、還在跑本地 startStream(),這裡
    // 會等到 findByText 逾時都等不到這串文字(本地跑的是 lib/streaming.ts
    // 私有的 MOCK_REPLY,兩者不會相等)。
    expect(await screen.findByText(SERVER_ASSISTANT_CONTENT)).toBeInTheDocument();
  });

  it("never calls the local mock stream or classifies an answer state itself once a message actually sends", async () => {
    let sent = false;
    mockedListMessages.mockImplementation(() =>
      Promise.resolve({ ok: true, value: sent ? [SENT_USER_MESSAGE, SERVER_ASSISTANT_MESSAGE] : [] }),
    );
    mockedSendMessage.mockImplementation(async () => {
      sent = true;
      return { ok: true, value: SENT_USER_MESSAGE };
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");

    submitViaComposer(USER_QUESTION);

    await waitFor(() => expect(mockedSendMessage).toHaveBeenCalledTimes(1));
    // attemptSend 在 sendMessage() resolve 之後、同一個 microtask 續段裡就會呼叫
    // classifyAnswerState()/startStream()（如果那條路還在的話）——等 pending
    // 狀態消失，代表 attemptSend 的送出續段已經整段跑完，兩個 spy 此時的呼叫
    // 次數就是決定性的。
    await waitFor(() => expect(screen.queryByText("傳送中…")).not.toBeInTheDocument());

    // 如果 message-thread.tsx 還在呼叫
    // `startStream(classifyAnswerState(content), shouldSimulateStreamDisconnect(content))`，
    // 這兩個 spy 至少各被呼叫一次；MOCK_REPLY 那條路一旦被加回來，這裡就會紅。
    expect(classifyAnswerStateSpy).not.toHaveBeenCalled();
    expect(mockedStreamAssistantReply).not.toHaveBeenCalled();
  });

  it("shows exactly as many citation rows in the related panel as the server message's citations carry", async () => {
    let sent = false;
    mockedListMessages.mockImplementation(() =>
      Promise.resolve({ ok: true, value: sent ? [SENT_USER_MESSAGE, SERVER_ASSISTANT_MESSAGE] : [] }),
    );
    mockedSendMessage.mockImplementation(async () => {
      sent = true;
      return { ok: true, value: SENT_USER_MESSAGE };
    });

    render(
      <>
        <MessageThread conversationId="c1" />
        <ConversationRelatedPanel conversationId="c1" />
      </>,
    );
    await screen.findByText("尚無訊息，開始對話吧。");

    submitViaComposer(USER_QUESTION);
    await screen.findByText(SERVER_ASSISTANT_CONTENT);

    const panel = screen.getByRole("region", { name: "相關內容" });
    // 這則訊息沒有附件，所以面板裡出現的 listitem 全部來自「引用來源」——
    // 決定性的量是「跟伺服器那則訊息的 citations 陣列一樣長」，不是
    // 「引用來源這一段存不存在」。今天的 ConversationRelatedPanel 只在
    // mount 時 fetch 一次，不會因為這個分頁自己送出的新訊息而重新抓，
    // 所以這裡預期會停在「尚無引用來源。」，逾時炸開。
    await waitFor(() => {
      expect(within(panel).getAllByRole("listitem")).toHaveLength(SERVER_ASSISTANT_MESSAGE.citations.length);
    });
  });

  it("shows an attachment sent in this tab in the related panel right away, not only after a reload", async () => {
    const FILE_NAME = "報價單.pdf";
    const userMessageWithAttachment: Message = {
      id: "u-attachment-1",
      conversationId: "c1",
      role: "user",
      content: "請看附件",
      attachmentNames: [FILE_NAME],
      createdAt: "2026-09-05T00:00:00.000Z",
    };

    let sent = false;
    mockedListMessages.mockImplementation(() => Promise.resolve({ ok: true, value: sent ? [userMessageWithAttachment] : [] }));
    mockedSendMessage.mockImplementation(async () => {
      sent = true;
      return { ok: true, value: userMessageWithAttachment };
    });

    render(
      <>
        <MessageThread conversationId="c1" />
        <ConversationRelatedPanel conversationId="c1" />
      </>,
    );
    await screen.findByText("尚無訊息，開始對話吧。");
    const panel = screen.getByRole("region", { name: "相關內容" });
    expect(within(panel).getByText("尚無附件。")).toBeInTheDocument();

    submitViaComposerWithFile("請看附件", FILE_NAME);

    await waitFor(() => expect(screen.queryByText("檔案處理中…")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("傳送中…")).not.toBeInTheDocument());

    // 決定性的量:面板裡出現跟氣泡一樣的檔名字串,不是「面板有沒有重新整理過」
    // 這種存在性描述。今天 ConversationRelatedPanel 只在 conversationId 變動時
    // 重新抓一次,不會因為這個分頁自己送出的新訊息而重新抓——這裡預期停在
    // 「尚無附件。」,逾時炸開。
    await waitFor(() => {
      expect(within(panel).queryByText("尚無附件。")).not.toBeInTheDocument();
    });
    expect(within(panel).getByText(FILE_NAME)).toBeInTheDocument();
  });
});
