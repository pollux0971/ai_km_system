import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ConversationRelatedPanel } from "./conversation-related-panel";
import type { Message } from "@/lib/messages";

// Override only listMessages — the component no longer reads
// extractCitationIds/getCitationSource at all (see 11-app-shell/phase-3,
// #42 below), so there's nothing else in this module worth preserving via
// importOriginal, but it's kept anyway (same narrow-override convention
// E13-S007 established) in case a future change reintroduces a dependency
// on another real export.
const { mockedListMessages } = vi.hoisted(() => ({
  mockedListMessages: vi.fn(),
}));
vi.mock("@/lib/messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/messages")>()),
  listMessages: mockedListMessages,
}));

function message(overrides: Partial<Message> & Pick<Message, "id" | "role" | "content">): Message {
  return {
    conversationId: "c1",
    attachmentNames: [],
    createdAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockedListMessages.mockReset();
});

describe("ConversationRelatedPanel (ux/enterprise-polish)", () => {
  /**
   * 11-app-shell/phase-3 (顧問裁決,2026-09-05,#42). Rewritten: this used
   * to attach citations to a message purely as `[N]` markers inside
   * `content` and let the panel parse them back out via
   * `extractCitationIds` + resolve through the old by-id mock
   * (`getCitationSource`). That data source is gone — the panel now reads
   * `message.citations` directly (ADR 0016). The decisive property this
   * test guards is unchanged from before the rewrite: attachments AND
   * citations are each deduplicated across the whole conversation (by
   * filename / by `documentId` respectively), not just within one
   * message — only the fixture shape changed, not what's asserted.
   */
  it("lists distinct attachments and citations (deduped by documentId) from the conversation's messages", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        message({ id: "m1", role: "user", content: "請看附件", attachmentNames: ["規格書.pdf", "報價單.xlsx"] }),
        message({ id: "m2", role: "assistant", content: "依據內容說明。", citations: [{ documentId: "doc-1", startOffset: 0, endOffset: 4 }] }),
        message({ id: "m3", role: "user", content: "再補一份", attachmentNames: ["規格書.pdf"] }),
        // Same documentId as m2's citation — proves dedup happens across
        // messages, not just within one message's own citations array.
        message({ id: "m4", role: "assistant", content: "同樣參考這份文件。", citations: [{ documentId: "doc-1", startOffset: 10, endOffset: 14 }] }),
      ],
    });

    render(<ConversationRelatedPanel conversationId="c1" />);

    expect(await screen.findByText("規格書.pdf")).toBeInTheDocument();
    expect(screen.getByText("報價單.xlsx")).toBeInTheDocument();
    // Deduplicated: the twice-attached file appears once.
    expect(screen.getAllByText("規格書.pdf")).toHaveLength(1);
    // Deduplicated: the same documentId cited by two different assistant
    // messages appears once, not twice.
    expect(screen.getAllByText("doc-1")).toHaveLength(1);
  });

  /**
   * 11-app-shell/phase-3 (顧問裁決,2026-09-05,#42;技術顧問 ai-km-1b
   * 追加裁決). RENAMED and rewritten — this used to be
   * "omits a FORBIDDEN citation source entirely (Deny-Wins) and ignores
   * [N] markers in user messages": it asserted a CLIENT-SIDE Deny-Wins
   * filter (`getCitationSource` resolving id "3" to FORBIDDEN, and the
   * panel silently omitting it) that made sense only when the client
   * itself invented citation ids with no server behind them. That filter
   * is gone along with the mock it depended on.
   *
   * The Deny-Wins GUARANTEE itself has NOT moved out of this codebase —
   * it moved to where authorization actually happens now: the server,
   * before a citation is ever handed to this client at all. The scenario
   * that proves it is `features/06-retrieval/phase-1.feature:22`
   * (`Scenario: Deny-Wins — a person in another department gets nothing,
   * not the other department's chunk`), green today. This test's own,
   * narrower job from here on is just: the panel is an honest MIRROR of
   * `message.citations` — it doesn't invent extra rows, and it doesn't
   * still fall back to parsing `[N]` markers out of message content
   * (a user's own message included) now that citations are a structured
   * field.
   */
  it("mirrors message.citations exactly — no more, no fewer rows, and no fallback to parsing [N] markers (Deny-Wins itself lives in features/06-retrieval/phase-1.feature:22)", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        // A [2]-shaped substring in a USER message, and [1]/[3]-shaped
        // substrings in the assistant's own content — none of these are
        // real `citations` entries, so if the panel ever regresses back
        // to regex-parsing `content`, this is what would catch it.
        message({ id: "m1", role: "user", content: "我在文件 [2] 看到的" }),
        message({ id: "m2", role: "assistant", content: "參考 [1] 與 [3]。", citations: [{ documentId: "doc-1", startOffset: 0, endOffset: 4 }] }),
      ],
    });

    render(<ConversationRelatedPanel conversationId="c1" />);

    const list = await screen.findByText("doc-1");
    // Exactly the one row `message.citations` actually carries — a
    // regression back to `[N]`-marker parsing would add rows for "2"
    // (from the user's own message) and "3" (an assistant `[N]` marker
    // with no backing `citations` entry), which this length assertion
    // would catch.
    expect(within(list.closest("ul") as HTMLElement).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  it("shows honest empty states when the conversation has no attachments or citations", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [message({ id: "m1", role: "user", content: "哈囉" })] });

    render(<ConversationRelatedPanel conversationId="c1" />);

    expect(await screen.findByText("尚無附件。")).toBeInTheDocument();
    expect(screen.getByText("尚無引用來源。")).toBeInTheDocument();
  });

  it("shows a distinct failure message when messages cannot be loaded", async () => {
    mockedListMessages.mockResolvedValue({ ok: false, error: { code: "SERVER_ERROR", message: "boom" } });

    render(<ConversationRelatedPanel conversationId="c1" />);

    expect(await screen.findByText("無法載入相關內容。")).toBeInTheDocument();
    expect(screen.queryByText("尚無附件。")).not.toBeInTheDocument();
  });
});
