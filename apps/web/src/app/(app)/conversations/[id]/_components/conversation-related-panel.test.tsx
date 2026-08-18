import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationRelatedPanel } from "./conversation-related-panel";
import type { Message } from "@/lib/messages";

// Override only listMessages (importOriginal keeps the real
// extractCitationIds the component also imports — same narrow-override
// convention E13-S007 established). getCitationSource stays the REAL
// implementation on purpose: its FORBIDDEN handling for citation id "3"
// is exactly the Deny-Wins behavior the omission test below verifies.
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
  it("lists distinct attachments and resolvable citation sources from the conversation's messages", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        message({ id: "m1", role: "user", content: "請看附件", attachmentNames: ["規格書.pdf", "報價單.xlsx"] }),
        message({ id: "m2", role: "assistant", content: "依據 [1] 的內容說明。" }),
        message({ id: "m3", role: "user", content: "再補一份", attachmentNames: ["規格書.pdf"] }),
        message({ id: "m4", role: "assistant", content: "同樣參考 [1]。" }),
      ],
    });

    render(<ConversationRelatedPanel conversationId="c1" />);

    expect(await screen.findByText("規格書.pdf")).toBeInTheDocument();
    expect(screen.getByText("報價單.xlsx")).toBeInTheDocument();
    // Deduplicated: the twice-attached file appears once.
    expect(screen.getAllByText("規格書.pdf")).toHaveLength(1);
    // Citation [1] resolves through the real getCitationSource, once.
    expect(screen.getAllByText(/模擬來源文件 1/)).toHaveLength(1);
  });

  it("omits a FORBIDDEN citation source entirely (Deny-Wins) and ignores [N] markers in user messages", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        message({ id: "m1", role: "user", content: "我在文件 [2] 看到的" }),
        message({ id: "m2", role: "assistant", content: "參考 [1] 與 [3]。" }),
      ],
    });

    render(<ConversationRelatedPanel conversationId="c1" />);

    expect(await screen.findByText(/模擬來源文件 1/)).toBeInTheDocument();
    // [3] is FORBIDDEN — must not leak into the listing in any form.
    expect(screen.queryByText(/第 3 頁|模擬來源文件 3/)).not.toBeInTheDocument();
    // [2] only appeared in a USER message — not an assistant citation.
    expect(screen.queryByText(/模擬來源文件 2/)).not.toBeInTheDocument();
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
