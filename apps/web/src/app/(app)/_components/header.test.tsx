import { describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import Header from "./header";
import { ConversationEventsProvider, type ConversationEventSourceLike } from "@/lib/conversation-events-context";
import type { ConnectionStatus, ConversationEvent } from "@/lib/conversation-events";
import { CurrentUserProvider } from "@/lib/session-context";

vi.mock("@/lib/auth", () => ({
  authClient: {
    login: vi.fn(),
    logout: vi.fn(),
    getSession: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const session = {
  userId: "u1",
  roles: ["general_user"],
  expiresAt: "2099-01-01T00:00:00.000Z",
};

describe("Header", () => {
  it("renders the app name, notification center, and user-menu trigger (waits for NotificationCenter's own async load to settle — state detail lives in notification-center.test.tsx)", async () => {
    render(
      <CurrentUserProvider value={session}>
        <Header />
      </CurrentUserProvider>,
    );

    expect(screen.getByText("AI KM")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "u1" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^通知/ })).toBeInTheDocument();
  });

  describe("E03-S039: cross-window sync status indicator", () => {
    function makeFakeSource(): ConversationEventSourceLike & { setStatus(status: ConnectionStatus): void } {
      const statusHandlers = new Set<(status: ConnectionStatus) => void>();
      let status: ConnectionStatus = "connecting";
      return {
        subscribe: (_handler: (event: ConversationEvent) => void) => () => {},
        onStatusChange(handler) {
          statusHandlers.add(handler);
          return () => statusHandlers.delete(handler);
        },
        status: () => status,
        close: vi.fn(),
        setStatus(next) {
          status = next;
          for (const handler of statusHandlers) handler(status);
        },
      };
    }

    it("shows no sync-status text while the connection is open", () => {
      const source = makeFakeSource();
      source.setStatus("open");

      render(
        <CurrentUserProvider value={session}>
          <ConversationEventsProvider source={source}>
            <Header />
          </ConversationEventsProvider>
        </CurrentUserProvider>,
      );

      expect(screen.getByText("AI KM").closest("header")).toHaveTextContent(/^AI KM/);
      expect(screen.queryByText("同步連線中斷，重新連線中…")).not.toBeInTheDocument();
    });

    it("shows the reconnecting notice in an aria-live region while reconnecting, and it disappears once open again", () => {
      const source = makeFakeSource();

      render(
        <CurrentUserProvider value={session}>
          <ConversationEventsProvider source={source}>
            <Header />
          </ConversationEventsProvider>
        </CurrentUserProvider>,
      );

      act(() => source.setStatus("reconnecting"));
      const notice = screen.getByText("同步連線中斷，重新連線中…");
      expect(notice.closest('[aria-live="polite"]')).not.toBeNull();

      act(() => source.setStatus("open"));
      expect(screen.queryByText("同步連線中斷，重新連線中…")).not.toBeInTheDocument();
    });

    it("without any ConversationEventsProvider, never shows the notice (existing render sites need no provider)", () => {
      render(
        <CurrentUserProvider value={session}>
          <Header />
        </CurrentUserProvider>,
      );

      expect(screen.queryByText("同步連線中斷，重新連線中…")).not.toBeInTheDocument();
    });
  });
});
