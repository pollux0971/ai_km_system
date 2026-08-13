import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ModeSwitch } from "./mode-switch";
import { setConversationMode } from "@/lib/conversations";

vi.mock("@/lib/conversations", () => ({
  setConversationMode: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedSetConversationMode = vi.mocked(setConversationMode);

beforeEach(() => {
  mockedSetConversationMode.mockReset();
});

describe("ModeSwitch (E03-S002)", () => {
  it("shows the initial mode as pressed", () => {
    render(<ModeSwitch conversationId="c1" initialMode="normal" />);

    expect(screen.getByRole("button", { name: "一般模式" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "進階模式" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches to the clicked mode once the update succeeds", async () => {
    mockedSetConversationMode.mockResolvedValue({
      ok: true,
      value: {
        id: "c1",
        title: "t",
        lastMessageAt: "2026-08-14T00:00:00.000Z",
        lastMessagePreview: "p",
        mode: "advanced",
        knowledgeScopes: [],
      },
    });

    render(<ModeSwitch conversationId="c1" initialMode="normal" />);

    fireEvent.click(screen.getByRole("button", { name: "進階模式" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "進階模式" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: "一般模式" })).toHaveAttribute("aria-pressed", "false");
    expect(mockedSetConversationMode).toHaveBeenCalledWith("c1", "advanced");
  });

  it("shows a pending state while the switch is in flight", async () => {
    mockedSetConversationMode.mockReturnValue(new Promise(() => {}));

    render(<ModeSwitch conversationId="c1" initialMode="normal" />);
    fireEvent.click(screen.getByRole("button", { name: "進階模式" }));

    expect(await screen.findByRole("status")).toHaveTextContent("切換中…");
    expect(screen.getByRole("button", { name: "一般模式" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "進階模式" })).toBeDisabled();
  });

  it("shows a distinct error state and keeps the previous mode when the switch fails", async () => {
    mockedSetConversationMode.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "找不到這個對話。" },
    });

    render(<ModeSwitch conversationId="c1" initialMode="normal" />);
    fireEvent.click(screen.getByRole("button", { name: "進階模式" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("切換模式失敗，請稍後再試。");
    expect(screen.getByRole("button", { name: "一般模式" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "進階模式" })).toHaveAttribute("aria-pressed", "false");
  });

  it("does not call setConversationMode when clicking the already-active mode", () => {
    render(<ModeSwitch conversationId="c1" initialMode="normal" />);

    fireEvent.click(screen.getByRole("button", { name: "一般模式" }));

    expect(mockedSetConversationMode).not.toHaveBeenCalled();
  });
});
