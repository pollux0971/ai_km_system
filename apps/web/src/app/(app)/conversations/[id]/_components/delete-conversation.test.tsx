import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeleteConversation } from "./delete-conversation";
import { deleteConversation } from "@/lib/conversations";
import { deleteMessagesForConversation } from "@/lib/messages";

const { mockReplace, mockRefresh, mockRouter } = vi.hoisted(() => {
  const mockReplace = vi.fn();
  const mockRefresh = vi.fn();
  return { mockReplace, mockRefresh, mockRouter: { replace: mockReplace, refresh: mockRefresh } };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("@/lib/conversations", () => ({
  deleteConversation: vi.fn(),
}));

vi.mock("@/lib/messages", () => ({
  deleteMessagesForConversation: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedDeleteConversation = vi.mocked(deleteConversation);
const mockedDeleteMessagesForConversation = vi.mocked(deleteMessagesForConversation);

beforeEach(() => {
  mockReplace.mockReset();
  mockRefresh.mockReset();
  mockedDeleteConversation.mockReset();
  mockedDeleteMessagesForConversation.mockReset();
  mockedDeleteMessagesForConversation.mockResolvedValue({ ok: true, value: undefined });
});

describe("DeleteConversation (E03-S025)", () => {
  it("shows a 刪除對話 button initially, with no confirmation prompt", () => {
    render(<DeleteConversation conversationId="c1" title="測試對話" />);

    expect(screen.getByRole("button", { name: "刪除對話" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("clicking 刪除對話 shows a confirmation prompt naming the conversation, without deleting anything yet", () => {
    render(<DeleteConversation conversationId="c1" title="測試對話" />);

    fireEvent.click(screen.getByRole("button", { name: "刪除對話" }));

    expect(screen.getByRole("alertdialog", { name: "確認刪除對話" })).toBeInTheDocument();
    expect(screen.getByText("確定要刪除「測試對話」嗎？此操作無法復原。")).toBeInTheDocument();
    expect(mockedDeleteConversation).not.toHaveBeenCalled();
  });

  it("取消 dismisses the confirmation without calling deleteConversation", () => {
    render(<DeleteConversation conversationId="c1" title="測試對話" />);
    fireEvent.click(screen.getByRole("button", { name: "刪除對話" }));

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刪除對話" })).toBeInTheDocument();
    expect(mockedDeleteConversation).not.toHaveBeenCalled();
  });

  it("確認刪除 calls deleteConversation, then deleteMessagesForConversation, then navigates to /conversations", async () => {
    mockedDeleteConversation.mockResolvedValue({ ok: true, value: undefined });
    render(<DeleteConversation conversationId="c1" title="測試對話" />);
    fireEvent.click(screen.getByRole("button", { name: "刪除對話" }));

    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/conversations"));
    expect(mockedDeleteConversation).toHaveBeenCalledWith("c1");
    expect(mockedDeleteMessagesForConversation).toHaveBeenCalledWith("c1");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows an error message and stays on the confirmation view when deleteConversation fails, without navigating", async () => {
    mockedDeleteConversation.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });
    render(<DeleteConversation conversationId="c1" title="測試對話" />);
    fireEvent.click(screen.getByRole("button", { name: "刪除對話" }));

    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("刪除對話失敗，請稍後再試。");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does not cascade-delete messages when deleteConversation itself fails", async () => {
    mockedDeleteConversation.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });
    render(<DeleteConversation conversationId="c1" title="測試對話" />);
    fireEvent.click(screen.getByRole("button", { name: "刪除對話" }));

    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    await screen.findByRole("alert");
    expect(mockedDeleteMessagesForConversation).not.toHaveBeenCalled();
  });

  it("disables 確認刪除 and 取消 while the delete is in flight", async () => {
    let resolveDelete!: (value: Awaited<ReturnType<typeof deleteConversation>>) => void;
    mockedDeleteConversation.mockReturnValue(new Promise((resolve) => (resolveDelete = resolve)));
    render(<DeleteConversation conversationId="c1" title="測試對話" />);
    fireEvent.click(screen.getByRole("button", { name: "刪除對話" }));

    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    expect(screen.getByRole("button", { name: "確認刪除" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();

    resolveDelete({ ok: true, value: undefined });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  });

  it("re-opening the confirmation after cancelling still shows no error from a previous attempt", async () => {
    mockedDeleteConversation.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });
    render(<DeleteConversation conversationId="c1" title="測試對話" />);
    fireEvent.click(screen.getByRole("button", { name: "刪除對話" }));
    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    fireEvent.click(screen.getByRole("button", { name: "刪除對話" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
