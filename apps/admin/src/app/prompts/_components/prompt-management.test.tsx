import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PromptManagement from "./prompt-management";
import { createPrompt, listPrompts } from "@/lib/prompts";

vi.mock("@/lib/prompts", () => ({
  listPrompts: vi.fn(),
  createPrompt: vi.fn(),
}));

const mockedListPrompts = vi.mocked(listPrompts);
const mockedCreatePrompt = vi.mocked(createPrompt);

beforeEach(() => {
  mockedListPrompts.mockReset();
  mockedCreatePrompt.mockReset();
});

describe("PromptManagement (E11-S012)", () => {
  it("shows a loading indicator before the list resolves", () => {
    mockedListPrompts.mockReturnValue(new Promise(() => {}));

    render(<PromptManagement />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedListPrompts.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<PromptManagement />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows an empty state when there are no prompts", async () => {
    mockedListPrompts.mockResolvedValue({ ok: true, value: [] });

    render(<PromptManagement />);

    expect(await screen.findByText("尚無提示詞。")).toBeInTheDocument();
  });

  it("shows every prompt's own name and content once loaded", async () => {
    mockedListPrompts.mockResolvedValue({
      ok: true,
      value: [
        { promptId: "p1", name: "客服回覆語氣", content: "請以友善的語氣回答。" },
        { promptId: "p2", name: "技術支援語氣", content: "請提供具體的排除步驟。" },
      ],
    });

    render(<PromptManagement />);

    expect(await screen.findByText("客服回覆語氣")).toBeInTheDocument();
    expect(screen.getByText("請以友善的語氣回答。")).toBeInTheDocument();
    expect(screen.getByText("技術支援語氣")).toBeInTheDocument();
    expect(screen.getByText("請提供具體的排除步驟。")).toBeInTheDocument();
  });

  it("renders every prompt it's given, not just the first few — a silent truncation would slip past a small fixture", async () => {
    const names = ["客服回覆語氣", "技術支援語氣", "銷售建議語氣", "稽核摘要語氣", "教育訓練語氣", "行政公告語氣"];
    mockedListPrompts.mockResolvedValue({
      ok: true,
      value: names.map((name, index) => ({ promptId: `p${index}`, name, content: `${name} 的內容。` })),
    });

    render(<PromptManagement />);

    await screen.findByText("客服回覆語氣");
    for (const name of names) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("does not show the empty state once prompts are loaded", async () => {
    mockedListPrompts.mockResolvedValue({ ok: true, value: [{ promptId: "p1", name: "客服回覆語氣", content: "內容。" }] });

    render(<PromptManagement />);

    await screen.findByText("客服回覆語氣");
    expect(screen.queryByText("尚無提示詞。")).not.toBeInTheDocument();
  });

  it("keeps the create button disabled while the name or content field is empty", async () => {
    mockedListPrompts.mockResolvedValue({ ok: true, value: [] });

    render(<PromptManagement />);
    await screen.findByText("尚無提示詞。");

    expect(screen.getByRole("button", { name: "新增提示詞" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("提示詞名稱"), { target: { value: "客服回覆語氣" } });
    expect(screen.getByRole("button", { name: "新增提示詞" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("提示詞內容"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "新增提示詞" })).toBeDisabled();
  });

  it("creates a new prompt, shows it in the list without a page reload, and clears the form", async () => {
    mockedListPrompts.mockResolvedValue({ ok: true, value: [] });
    mockedCreatePrompt.mockResolvedValue({
      ok: true,
      value: { promptId: "p1", name: "客服回覆語氣", content: "請以友善的語氣回答。" },
    });

    render(<PromptManagement />);
    await screen.findByText("尚無提示詞。");

    fireEvent.change(screen.getByLabelText("提示詞名稱"), { target: { value: "  客服回覆語氣  " } });
    fireEvent.change(screen.getByLabelText("提示詞內容"), { target: { value: "  請以友善的語氣回答。  " } });
    fireEvent.click(screen.getByRole("button", { name: "新增提示詞" }));

    expect(mockedCreatePrompt).toHaveBeenCalledWith({ name: "客服回覆語氣", content: "請以友善的語氣回答。" });
    expect(await screen.findByText("客服回覆語氣")).toBeInTheDocument();
    expect(screen.getByText("請以友善的語氣回答。")).toBeInTheDocument();
    expect(screen.getByLabelText("提示詞名稱")).toHaveValue("");
    expect(screen.getByLabelText("提示詞內容")).toHaveValue("");
  });

  it("shows a distinct error message and keeps the entered draft when creation fails", async () => {
    mockedListPrompts.mockResolvedValue({ ok: true, value: [] });
    mockedCreatePrompt.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "請輸入名稱與內容。" } });

    render(<PromptManagement />);
    await screen.findByText("尚無提示詞。");

    fireEvent.change(screen.getByLabelText("提示詞名稱"), { target: { value: "客服回覆語氣" } });
    fireEvent.change(screen.getByLabelText("提示詞內容"), { target: { value: "請以友善的語氣回答。" } });
    fireEvent.click(screen.getByRole("button", { name: "新增提示詞" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("新增失敗，請稍後再試。");
    expect(screen.getByLabelText("提示詞名稱")).toHaveValue("客服回覆語氣");
    expect(screen.getByLabelText("提示詞內容")).toHaveValue("請以友善的語氣回答。");
  });

  it("disables the create button and fields while the creation is in flight, preventing a double submit", async () => {
    mockedListPrompts.mockResolvedValue({ ok: true, value: [] });
    let resolveCreate!: (value: Awaited<ReturnType<typeof createPrompt>>) => void;
    mockedCreatePrompt.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)));

    render(<PromptManagement />);
    await screen.findByText("尚無提示詞。");

    fireEvent.change(screen.getByLabelText("提示詞名稱"), { target: { value: "客服回覆語氣" } });
    fireEvent.change(screen.getByLabelText("提示詞內容"), { target: { value: "請以友善的語氣回答。" } });
    fireEvent.click(screen.getByRole("button", { name: "新增提示詞" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "新增提示詞" })).toBeDisabled());
    expect(screen.getByLabelText("提示詞名稱")).toBeDisabled();
    expect(screen.getByLabelText("提示詞內容")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "新增提示詞" }));

    resolveCreate({ ok: true, value: { promptId: "p1", name: "客服回覆語氣", content: "請以友善的語氣回答。" } });
    await waitFor(() => expect(mockedCreatePrompt).toHaveBeenCalledTimes(1));
  });
});
