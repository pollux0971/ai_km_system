import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RenameConversation } from "./rename-conversation";
import { renameConversation } from "@/lib/conversations";

vi.mock("@/lib/conversations", () => ({
  renameConversation: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedRenameConversation = vi.mocked(renameConversation);

const DEFAULT_RENAMED = {
  id: "c1",
  conversationId: "c1",
  title: "新標題",
  lastMessageAt: "2026-08-12T09:15:00.000Z",
  lastMessagePreview: "測試預覽",
  mode: "normal" as const,
  knowledgeScopes: [],
  model: "standard" as const,
};

beforeEach(() => {
  mockedRenameConversation.mockReset();
});

describe("RenameConversation (E03-S024)", () => {
  it("shows the initial title as a level-1 heading, with a 重新命名 button", () => {
    render(<RenameConversation conversationId="c1" initialTitle="原始標題" />);

    expect(screen.getByRole("heading", { name: "原始標題", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新命名" })).toBeInTheDocument();
  });

  it("clicking 重新命名 shows an editable input pre-filled with the current title", () => {
    render(<RenameConversation conversationId="c1" initialTitle="原始標題" />);

    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));

    expect(screen.getByLabelText("對話名稱")).toHaveValue("原始標題");
    expect(screen.queryByRole("heading", { name: "原始標題", level: 1 })).not.toBeInTheDocument();
  });

  it("儲存 is disabled when the draft is empty or whitespace-only", () => {
    render(<RenameConversation conversationId="c1" initialTitle="原始標題" />);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));

    const input = screen.getByLabelText("對話名稱");
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByRole("button", { name: "儲存" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "儲存" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "新標題" } });
    expect(screen.getByRole("button", { name: "儲存" })).not.toBeDisabled();
  });

  it("submitting a valid new title calls renameConversation with the trimmed value, then shows the updated heading", async () => {
    mockedRenameConversation.mockResolvedValue({ ok: true, value: DEFAULT_RENAMED });
    render(<RenameConversation conversationId="c1" initialTitle="原始標題" />);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));

    fireEvent.change(screen.getByLabelText("對話名稱"), { target: { value: "  新標題  " } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(mockedRenameConversation).toHaveBeenCalledWith("c1", "新標題"));
    expect(await screen.findByRole("heading", { name: "新標題", level: 1 })).toBeInTheDocument();
    expect(screen.queryByLabelText("對話名稱")).not.toBeInTheDocument();
  });

  it("取消 reverts to the original title without calling renameConversation", () => {
    render(<RenameConversation conversationId="c1" initialTitle="原始標題" />);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));

    fireEvent.change(screen.getByLabelText("對話名稱"), { target: { value: "還沒送出的草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.getByRole("heading", { name: "原始標題", level: 1 })).toBeInTheDocument();
    expect(screen.queryByLabelText("對話名稱")).not.toBeInTheDocument();
    expect(mockedRenameConversation).not.toHaveBeenCalled();
  });

  it("re-opening the edit form after cancelling starts from the current (not the discarded draft) title", () => {
    render(<RenameConversation conversationId="c1" initialTitle="原始標題" />);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));
    fireEvent.change(screen.getByLabelText("對話名稱"), { target: { value: "還沒送出的草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));

    expect(screen.getByLabelText("對話名稱")).toHaveValue("原始標題");
  });

  it("shows an error message and stays in edit mode when the rename fails", async () => {
    mockedRenameConversation.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });
    render(<RenameConversation conversationId="c1" initialTitle="原始標題" />);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));

    fireEvent.change(screen.getByLabelText("對話名稱"), { target: { value: "新標題" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("重新命名失敗，請稍後再試。");
    expect(screen.getByLabelText("對話名稱")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "新標題", level: 1 })).not.toBeInTheDocument();
  });

  it("disables the input and buttons while the rename is in flight", async () => {
    let resolveRename!: (value: Awaited<ReturnType<typeof renameConversation>>) => void;
    mockedRenameConversation.mockReturnValue(new Promise((resolve) => (resolveRename = resolve)));
    render(<RenameConversation conversationId="c1" initialTitle="原始標題" />);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));
    fireEvent.change(screen.getByLabelText("對話名稱"), { target: { value: "新標題" } });

    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    expect(screen.getByLabelText("對話名稱")).toBeDisabled();
    expect(screen.getByRole("button", { name: "儲存" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();

    resolveRename({ ok: true, value: DEFAULT_RENAMED });
    await waitFor(() => expect(screen.queryByLabelText("對話名稱")).not.toBeInTheDocument());
  });
});
