import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ConversationDetail from "./conversation-detail";
import { getConversation } from "@/lib/conversations";

vi.mock("@/lib/conversations", () => ({
  getConversation: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedGetConversation = vi.mocked(getConversation);

describe("ConversationDetail (E03-S002)", () => {
  it("shows a loading state before the conversation resolves", () => {
    mockedGetConversation.mockReturnValue(new Promise(() => {}));

    render(<ConversationDetail id="c1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the title and mode switch once loaded", async () => {
    mockedGetConversation.mockResolvedValue({
      ok: true,
      value: {
        id: "c1",
        title: "測試對話",
        lastMessageAt: "2026-08-12T09:15:00.000Z",
        lastMessagePreview: "測試預覽",
        mode: "advanced",
      },
    });

    render(<ConversationDetail id="c1" />);

    expect(await screen.findByRole("heading", { name: "測試對話", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "對話模式" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "進階模式" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a distinct error state when loading fails", async () => {
    mockedGetConversation.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<ConversationDetail id="c1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入對話。");
  });

  it("shows a distinct not-found state (not the generic error) when the id doesn't match anything", async () => {
    mockedGetConversation.mockResolvedValue({ ok: true, value: null });

    render(<ConversationDetail id="does-not-exist" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到您要的內容。");
  });
});
