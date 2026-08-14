import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgePromptEditor from "./knowledge-prompt-editor";
import { getKnowledgeBase, updateKnowledgeBaseBoundPrompt } from "@/lib/knowledge-bases";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/knowledge-bases", () => ({
  getKnowledgeBase: vi.fn(),
  updateKnowledgeBaseBoundPrompt: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedGetKnowledgeBase = vi.mocked(getKnowledgeBase);
const mockedUpdateKnowledgeBaseBoundPrompt = vi.mocked(updateKnowledgeBaseBoundPrompt);
const mockedTrackEvent = vi.mocked(trackEvent);

const sampleKnowledgeBase = {
  id: "kb1",
  name: "研發部門知識庫",
  description: "內部技術文件。",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

beforeEach(() => {
  mockedGetKnowledgeBase.mockReset();
  mockedUpdateKnowledgeBaseBoundPrompt.mockReset();
  mockedTrackEvent.mockReset();
});

describe("KnowledgePromptEditor (E05-S008)", () => {
  it("shows a loading state before the knowledge base resolves", () => {
    mockedGetKnowledgeBase.mockReturnValue(new Promise(() => {}));

    render(<KnowledgePromptEditor id="kb1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows a distinct error state when loading fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<KnowledgePromptEditor id="kb1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入知識庫。");
  });

  it("shows a distinct not-found state (not the generic error) when the id doesn't match anything", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: null });

    render(<KnowledgePromptEditor id="does-not-exist" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到您要的內容。");
  });

  it("shows an empty textarea when no prompt has been bound yet", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgePromptEditor id="kb1" />);

    expect(await screen.findByLabelText("綁定提示詞(選填)")).toHaveValue("");
  });

  it("pre-fills the textarea with the existing bound prompt", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, boundPrompt: "請用友善、簡潔的語氣回答客服問題。" },
    });

    render(<KnowledgePromptEditor id="kb1" />);

    expect(await screen.findByLabelText("綁定提示詞(選填)")).toHaveValue("請用友善、簡潔的語氣回答客服問題。");
  });

  it("the 儲存 button is enabled even with an empty draft — an empty prompt is a valid state, not a validation error", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgePromptEditor id="kb1" />);
    await screen.findByLabelText("綁定提示詞(選填)");

    expect(screen.getByRole("button", { name: "儲存" })).toBeEnabled();
  });

  it("saving succeeds and shows a 已儲存 confirmation", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseBoundPrompt.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, boundPrompt: "新的提示詞內容。" },
    });

    render(<KnowledgePromptEditor id="kb1" />);
    await screen.findByLabelText("綁定提示詞(選填)");

    fireEvent.change(screen.getByLabelText("綁定提示詞(選填)"), { target: { value: "新的提示詞內容。" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    expect(await screen.findByRole("status")).toHaveTextContent("已儲存。");
    expect(mockedUpdateKnowledgeBaseBoundPrompt).toHaveBeenCalledWith("kb1", "新的提示詞內容。");
  });

  it("clears the 已儲存 confirmation as soon as the draft is edited again", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseBoundPrompt.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, boundPrompt: "第一版。" },
    });

    render(<KnowledgePromptEditor id="kb1" />);
    await screen.findByLabelText("綁定提示詞(選填)");
    fireEvent.change(screen.getByLabelText("綁定提示詞(選填)"), { target: { value: "第一版。" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await screen.findByRole("status");

    fireEvent.change(screen.getByLabelText("綁定提示詞(選填)"), { target: { value: "第一版。修改中" } });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a distinct error alert when saving fails, and keeps the entered draft", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseBoundPrompt.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<KnowledgePromptEditor id="kb1" />);
    await screen.findByLabelText("綁定提示詞(選填)");
    fireEvent.change(screen.getByLabelText("綁定提示詞(選填)"), { target: { value: "測試草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("更新提示詞失敗");
    expect(screen.getByLabelText("綁定提示詞(選填)")).toHaveValue("測試草稿");
  });

  it("disables the textarea and 儲存 button while a save is in flight, preventing a double submit", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    let resolveUpdate!: (result: Awaited<ReturnType<typeof updateKnowledgeBaseBoundPrompt>>) => void;
    mockedUpdateKnowledgeBaseBoundPrompt.mockReturnValueOnce(new Promise((resolve) => (resolveUpdate = resolve)));

    render(<KnowledgePromptEditor id="kb1" />);
    await screen.findByLabelText("綁定提示詞(選填)");
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "儲存" })).toBeDisabled());
    expect(screen.getByLabelText("綁定提示詞(選填)")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    resolveUpdate({ ok: true, value: sampleKnowledgeBase });
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

    expect(mockedUpdateKnowledgeBaseBoundPrompt).toHaveBeenCalledTimes(1);
  });

  it("shows a 返回知識庫詳情 link pointing back at /knowledge/{id}", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgePromptEditor id="kb1" />);
    await screen.findByLabelText("綁定提示詞(選填)");

    expect(screen.getByRole("link", { name: "返回知識庫詳情" })).toHaveAttribute("href", "/knowledge/kb1");
  });

  it("emits attempt and success telemetry sharing the same correlation id, WITHOUT including the prompt text itself", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseBoundPrompt.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, boundPrompt: "機密的企業提示詞內容" },
    });

    render(<KnowledgePromptEditor id="kb1" />);
    await screen.findByLabelText("綁定提示詞(選填)");
    fireEvent.change(screen.getByLabelText("綁定提示詞(選填)"), { target: { value: "機密的企業提示詞內容" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(mockedUpdateKnowledgeBaseBoundPrompt).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_prompt_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_prompt_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attempt = attemptCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    const success = successCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    expect(attempt[1].correlationId).toBe(success[1].correlationId);
    // The whole point of this test: no call anywhere included the actual prompt text.
    for (const call of mockedTrackEvent.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("機密的企業提示詞內容");
    }
  });

  it("emits failure telemetry with the error code when saving fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseBoundPrompt.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<KnowledgePromptEditor id="kb1" />);
    await screen.findByLabelText("綁定提示詞(選填)");
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_prompt_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("SERVICE_UNAVAILABLE");
  });
});
