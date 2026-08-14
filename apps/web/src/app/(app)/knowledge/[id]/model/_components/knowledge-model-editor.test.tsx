import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgeModelEditor from "./knowledge-model-editor";
import { getKnowledgeBase, updateKnowledgeBaseBoundModel } from "@/lib/knowledge-bases";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/knowledge-bases", () => ({
  getKnowledgeBase: vi.fn(),
  updateKnowledgeBaseBoundModel: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedGetKnowledgeBase = vi.mocked(getKnowledgeBase);
const mockedUpdateKnowledgeBaseBoundModel = vi.mocked(updateKnowledgeBaseBoundModel);
const mockedTrackEvent = vi.mocked(trackEvent);

const sampleKnowledgeBase = {
  id: "kb1",
  name: "研發部門知識庫",
  description: "內部技術文件。",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

beforeEach(() => {
  mockedGetKnowledgeBase.mockReset();
  mockedUpdateKnowledgeBaseBoundModel.mockReset();
  mockedTrackEvent.mockReset();
});

describe("KnowledgeModelEditor (E05-S009)", () => {
  it("shows a loading state before the knowledge base resolves", () => {
    mockedGetKnowledgeBase.mockReturnValue(new Promise(() => {}));

    render(<KnowledgeModelEditor id="kb1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows a distinct error state when loading fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<KnowledgeModelEditor id="kb1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入知識庫。");
  });

  it("shows a distinct not-found state (not the generic error) when the id doesn't match anything", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: null });

    render(<KnowledgeModelEditor id="does-not-exist" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到您要的內容。");
  });

  it("selects the unbound option when no model has been bound yet", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeModelEditor id="kb1" />);

    expect(await screen.findByRole("combobox", { name: "綁定模型" })).toHaveValue("");
  });

  it("selects the existing bound model", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: { ...sampleKnowledgeBase, boundModel: "advanced-local" } });

    render(<KnowledgeModelEditor id="kb1" />);

    expect(await screen.findByRole("combobox", { name: "綁定模型" })).toHaveValue("advanced-local");
  });

  it("lists the unbound option plus all AI models, with the cloud option disabled", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeModelEditor id="kb1" />);
    const select = await screen.findByRole("combobox", { name: "綁定模型" });

    const options = Array.from(select.querySelectorAll("option"));
    expect(options.map((option) => option.textContent)).toEqual([
      "（未綁定，依對話設定）",
      "標準模型（地端）",
      "進階模型（地端）",
      "雲端模型（尚未啟用）",
    ]);
    const cloudOption = options.find((option) => option.textContent === "雲端模型（尚未啟用）");
    expect(cloudOption).toBeDisabled();
  });

  it("binds the selected model once the update succeeds", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseBoundModel.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, boundModel: "advanced-local" },
    });

    render(<KnowledgeModelEditor id="kb1" />);
    const select = await screen.findByRole("combobox", { name: "綁定模型" });
    fireEvent.change(select, { target: { value: "advanced-local" } });

    await waitFor(() => expect(select).toHaveValue("advanced-local"));
    expect(mockedUpdateKnowledgeBaseBoundModel).toHaveBeenCalledWith("kb1", "advanced-local");
  });

  it("clears the bound model back to unbound when the empty option is selected", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: { ...sampleKnowledgeBase, boundModel: "standard" } });
    mockedUpdateKnowledgeBaseBoundModel.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, boundModel: undefined },
    });

    render(<KnowledgeModelEditor id="kb1" />);
    const select = await screen.findByRole("combobox", { name: "綁定模型" });
    fireEvent.change(select, { target: { value: "" } });

    await waitFor(() => expect(select).toHaveValue(""));
    expect(mockedUpdateKnowledgeBaseBoundModel).toHaveBeenCalledWith("kb1", undefined);
  });

  it("does not call updateKnowledgeBaseBoundModel when re-selecting the already-bound model", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: { ...sampleKnowledgeBase, boundModel: "standard" } });

    render(<KnowledgeModelEditor id="kb1" />);
    const select = await screen.findByRole("combobox", { name: "綁定模型" });
    fireEvent.change(select, { target: { value: "standard" } });

    expect(mockedUpdateKnowledgeBaseBoundModel).not.toHaveBeenCalled();
  });

  it("does not call updateKnowledgeBaseBoundModel when re-selecting unbound while already unbound", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeModelEditor id="kb1" />);
    const select = await screen.findByRole("combobox", { name: "綁定模型" });
    fireEvent.change(select, { target: { value: "" } });

    expect(mockedUpdateKnowledgeBaseBoundModel).not.toHaveBeenCalled();
  });

  it("shows a distinct error alert and reverts the select when the update fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseBoundModel.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "這個模型目前無法使用。" },
    });

    render(<KnowledgeModelEditor id="kb1" />);
    const select = await screen.findByRole("combobox", { name: "綁定模型" });
    fireEvent.change(select, { target: { value: "advanced-local" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("更新模型綁定失敗，請稍後再試。");
    expect(select).toHaveValue("");
  });

  it("disables the select while an update is in flight, preventing overlapping changes", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    let resolveUpdate!: (result: Awaited<ReturnType<typeof updateKnowledgeBaseBoundModel>>) => void;
    mockedUpdateKnowledgeBaseBoundModel.mockReturnValueOnce(new Promise((resolve) => (resolveUpdate = resolve)));

    render(<KnowledgeModelEditor id="kb1" />);
    const select = await screen.findByRole("combobox", { name: "綁定模型" });
    fireEvent.change(select, { target: { value: "advanced-local" } });

    await waitFor(() => expect(select).toBeDisabled());

    resolveUpdate({ ok: true, value: { ...sampleKnowledgeBase, boundModel: "advanced-local" } });
    await waitFor(() => expect(select).not.toBeDisabled());

    expect(mockedUpdateKnowledgeBaseBoundModel).toHaveBeenCalledTimes(1);
  });

  it("shows a 返回知識庫詳情 link pointing back at /knowledge/{id}", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeModelEditor id="kb1" />);
    await screen.findByRole("combobox", { name: "綁定模型" });

    expect(screen.getByRole("link", { name: "返回知識庫詳情" })).toHaveAttribute("href", "/knowledge/kb1");
  });

  it("emits attempt and success telemetry sharing the same correlation id, including the actual model values", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseBoundModel.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, boundModel: "advanced-local" },
    });

    render(<KnowledgeModelEditor id="kb1" />);
    const select = await screen.findByRole("combobox", { name: "綁定模型" });
    fireEvent.change(select, { target: { value: "advanced-local" } });

    await waitFor(() => expect(mockedUpdateKnowledgeBaseBoundModel).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_model_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_model_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attempt = attemptCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    const success = successCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    expect(attempt[1].correlationId).toBe(success[1].correlationId);
    expect(attempt[1].properties).toMatchObject({ knowledgeBaseId: "kb1", from: null, to: "advanced-local" });
    expect(success[1].properties).toMatchObject({ knowledgeBaseId: "kb1", model: "advanced-local" });
  });

  it("emits failure telemetry with the error code when the update fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseBoundModel.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "這個模型目前無法使用。" },
    });

    render(<KnowledgeModelEditor id="kb1" />);
    const select = await screen.findByRole("combobox", { name: "綁定模型" });
    fireEvent.change(select, { target: { value: "advanced-local" } });

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_model_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("VALIDATION_ERROR");
  });
});
