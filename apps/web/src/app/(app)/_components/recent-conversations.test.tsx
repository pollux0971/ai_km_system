import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import RecentConversations from "./recent-conversations";
import { ConversationEventsProvider, type ConversationEventSourceLike } from "@/lib/conversation-events-context";
import type { ConnectionStatus, ConversationEvent } from "@/lib/conversation-events";
import { getRecentConversations } from "@/lib/conversations";

vi.mock("@/lib/conversations", () => ({
  getRecentConversations: vi.fn(),
}));

const mockedGetRecentConversations = vi.mocked(getRecentConversations);

beforeEach(() => {
  mockedGetRecentConversations.mockReset();
});

describe("RecentConversations", () => {
  it("shows a loading state while the fetch is pending", () => {
    mockedGetRecentConversations.mockReturnValue(new Promise(() => {}));

    render(<RecentConversations />);

    expect(screen.getByRole("status")).toHaveTextContent("載入中…");
  });

  it("shows an error state distinct from empty when the fetch fails", async () => {
    mockedGetRecentConversations.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<RecentConversations />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入最近對話。");
    expect(screen.queryByText("尚無最近對話。")).not.toBeInTheDocument();
  });

  it("shows the empty state when the fetch succeeds with no conversations", async () => {
    mockedGetRecentConversations.mockResolvedValue({ ok: true, value: [] });

    render(<RecentConversations />);

    expect(await screen.findByText("尚無最近對話。")).toBeInTheDocument();
  });

  it("renders each conversation's title/preview and a link to view all", async () => {
    mockedGetRecentConversations.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "c1",
          title: "測試對話標題",
          lastMessageAt: "2026-08-12T09:15:00.000Z",
          lastMessagePreview: "測試預覽內容",
          mode: "normal",
          knowledgeScopes: [],
          model: "standard",
        },
      ],
    });

    render(<RecentConversations />);

    expect(await screen.findByText("測試對話標題")).toBeInTheDocument();
    expect(screen.getByText("測試預覽內容")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看全部對話" })).toHaveAttribute("href", "/conversations");
  });

  describe("E01-S024: M3 list tiles use formatRelativeTime", () => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2026-08-12T12:15:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows a relative time (3 小時前), not the raw locale string", async () => {
      mockedGetRecentConversations.mockResolvedValue({
        ok: true,
        value: [
          {
            id: "c1",
            title: "測試對話標題",
            lastMessageAt: "2026-08-12T09:15:00.000Z",
            lastMessagePreview: "測試預覽內容",
            mode: "normal",
            knowledgeScopes: [],
            model: "standard",
          },
        ],
      });

      render(<RecentConversations />);

      expect(await screen.findByText("3 小時前")).toBeInTheDocument();
    });
  });

  describe("E03-S039: cross-window sync (AC2/AC5)", () => {
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

    it("refetches on a conversation.created event, and the new item appears", async () => {
      const source = makeFakeSource();
      mockedGetRecentConversations.mockResolvedValue({ ok: true, value: [] });

      render(
        <ConversationEventsProvider source={source}>
          <RecentConversations />
        </ConversationEventsProvider>,
      );
      await screen.findByText("尚無最近對話。");
      const callsBeforeEvent = mockedGetRecentConversations.mock.calls.length;

      mockedGetRecentConversations.mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "c1",
            title: "另一視窗建立的對話",
            lastMessageAt: "2026-08-12T09:15:00.000Z",
            lastMessagePreview: "預覽",
            mode: "normal",
            knowledgeScopes: [],
            model: "standard",
          },
        ],
      });

      act(() => {
        source.emit({ id: 1, type: "conversation.created", conversationId: "c1", occurredAt: new Date().toISOString() });
      });

      expect(await screen.findByText("另一視窗建立的對話")).toBeInTheDocument();
      expect(mockedGetRecentConversations.mock.calls.length).toBeGreaterThan(callsBeforeEvent);
    });

    it("does not refetch on a message.* event", async () => {
      const source = makeFakeSource();
      mockedGetRecentConversations.mockResolvedValue({ ok: true, value: [] });

      render(
        <ConversationEventsProvider source={source}>
          <RecentConversations />
        </ConversationEventsProvider>,
      );
      await screen.findByText("尚無最近對話。");
      const callsBeforeEvent = mockedGetRecentConversations.mock.calls.length;

      act(() => {
        source.emit({ id: 1, type: "message.created", conversationId: "c1", messageId: "m1", occurredAt: new Date().toISOString() });
      });

      expect(mockedGetRecentConversations.mock.calls.length).toBe(callsBeforeEvent);
    });
  });
});
