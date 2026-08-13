import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import NewConversationPage from "./page";
import { createConversation } from "@/lib/conversations";
import { trackEvent } from "@/lib/telemetry";

const { mockReplace, mockRefresh, mockRouter } = vi.hoisted(() => {
  const mockReplace = vi.fn();
  const mockRefresh = vi.fn();
  // Stable reference — see session-gate.test.tsx for why this matters.
  return { mockReplace, mockRefresh, mockRouter: { replace: mockReplace, refresh: mockRefresh } };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("@/lib/conversations", () => ({
  createConversation: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedCreateConversation = vi.mocked(createConversation);
const mockedTrackEvent = vi.mocked(trackEvent);

const sampleConversation = {
  id: "new-1",
  title: "新對話",
  lastMessageAt: "2026-08-14T00:00:00.000Z",
  lastMessagePreview: "尚無訊息。",
  mode: "normal" as const,
  knowledgeScopes: [],
};

beforeEach(() => {
  mockReplace.mockReset();
  mockRefresh.mockReset();
  mockedCreateConversation.mockReset();
  mockedTrackEvent.mockReset();
});

describe("NewConversationPage (E03-S001)", () => {
  it("shows a creating state, then redirects to /conversations once the conversation is created", async () => {
    mockedCreateConversation.mockResolvedValue({ ok: true, value: sampleConversation });

    render(<NewConversationPage />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/conversations"));
    expect(mockedCreateConversation).toHaveBeenCalledTimes(1);
  });

  it("invalidates the router cache (refresh()) on success, so an already-visited page picks up the new conversation", async () => {
    mockedCreateConversation.mockResolvedValue({ ok: true, value: sampleConversation });

    render(<NewConversationPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("emits attempt and success telemetry sharing the same correlation id", async () => {
    mockedCreateConversation.mockResolvedValue({ ok: true, value: sampleConversation });

    render(<NewConversationPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "conversation_create_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "conversation_create_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attemptId = (attemptCall as [string, { correlationId: string }])[1].correlationId;
    const successId = (successCall as [string, { correlationId: string }])[1].correlationId;
    expect(attemptId).toBe(successId);
  });

  it("shows a distinct error state (not a silent redirect) when creation fails", async () => {
    mockedCreateConversation.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<NewConversationPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法建立新對話");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("calls createConversation exactly once even under React StrictMode's double-invoke effects (AC5: no duplicate side effect)", async () => {
    mockedCreateConversation.mockResolvedValue({ ok: true, value: sampleConversation });

    render(
      <StrictMode>
        <NewConversationPage />
      </StrictMode>,
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockedCreateConversation).toHaveBeenCalledTimes(1);
  });
});
