import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgeDocumentTextInput from "./knowledge-document-text-input";
import { addKnowledgeBaseDocumentFromText } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/knowledge-documents", () => ({
  addKnowledgeBaseDocumentFromText: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedAddKnowledgeBaseDocumentFromText = vi.mocked(addKnowledgeBaseDocumentFromText);
const mockedTrackEvent = vi.mocked(trackEvent);

function sampleDocument(
  overrides: Partial<{ id: string; knowledgeBaseId: string; name: string; content?: string; sizeBytes?: number; uploadedAt: string }> = {},
) {
  return {
    id: "doc1",
    knowledgeBaseId: "kb1",
    name: "標題",
    content: "內容",
    sizeBytes: 6,
    uploadedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockedAddKnowledgeBaseDocumentFromText.mockReset();
  mockedTrackEvent.mockReset();
});

describe("KnowledgeDocumentTextInput (E05-S015)", () => {
  it("shows a title input, content textarea, and a disabled 新增 button when both are empty", () => {
    render(<KnowledgeDocumentTextInput knowledgeBaseId="kb1" onAdded={vi.fn()} />);

    expect(screen.getByLabelText("標題")).toBeInTheDocument();
    expect(screen.getByLabelText("內容")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增" })).toBeDisabled();
  });

  it("keeps the 新增 button disabled if only the title is filled", () => {
    render(<KnowledgeDocumentTextInput knowledgeBaseId="kb1" onAdded={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("標題"), { target: { value: "標題" } });

    expect(screen.getByRole("button", { name: "新增" })).toBeDisabled();
  });

  it("keeps the 新增 button disabled if only the content is filled", () => {
    render(<KnowledgeDocumentTextInput knowledgeBaseId="kb1" onAdded={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("內容"), { target: { value: "內容" } });

    expect(screen.getByRole("button", { name: "新增" })).toBeDisabled();
  });

  it("enables the 新增 button once both title and content are non-whitespace", () => {
    render(<KnowledgeDocumentTextInput knowledgeBaseId="kb1" onAdded={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("標題"), { target: { value: "標題" } });
    fireEvent.change(screen.getByLabelText("內容"), { target: { value: "內容" } });

    expect(screen.getByRole("button", { name: "新增" })).toBeEnabled();
  });

  it("adds the entered title and content, clears both fields, and notifies the parent on success", async () => {
    mockedAddKnowledgeBaseDocumentFromText.mockResolvedValue({ ok: true, value: sampleDocument() });
    const onAdded = vi.fn();

    render(<KnowledgeDocumentTextInput knowledgeBaseId="kb1" onAdded={onAdded} />);
    fireEvent.change(screen.getByLabelText("標題"), { target: { value: "退貨政策" } });
    fireEvent.change(screen.getByLabelText("內容"), { target: { value: "7 天內可退貨。" } });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(mockedAddKnowledgeBaseDocumentFromText).toHaveBeenCalledWith("kb1", "退貨政策", "7 天內可退貨。");
    expect(screen.getByLabelText("標題")).toHaveValue("");
    expect(screen.getByLabelText("內容")).toHaveValue("");
  });

  it("shows a distinct error and keeps both fields when the content is rejected by the backend", async () => {
    mockedAddKnowledgeBaseDocumentFromText.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "內容不得為空。" },
    });

    render(<KnowledgeDocumentTextInput knowledgeBaseId="kb1" onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("標題"), { target: { value: "標題" } });
    fireEvent.change(screen.getByLabelText("內容"), { target: { value: "內容" } });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("內容不得為空。");
    expect(screen.getByLabelText("標題")).toHaveValue("標題");
    expect(screen.getByLabelText("內容")).toHaveValue("內容");
  });

  it("shows a different specific message for a NOT_FOUND failure, proving the message is not hardcoded", async () => {
    mockedAddKnowledgeBaseDocumentFromText.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "找不到這個知識庫。" },
    });

    render(<KnowledgeDocumentTextInput knowledgeBaseId="kb1" onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("標題"), { target: { value: "標題" } });
    fireEvent.change(screen.getByLabelText("內容"), { target: { value: "內容" } });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到這個知識庫。");
  });

  it("clears a previous error as soon as either field is edited again", async () => {
    mockedAddKnowledgeBaseDocumentFromText.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "找不到這個知識庫。" },
    });

    render(<KnowledgeDocumentTextInput knowledgeBaseId="kb1" onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("標題"), { target: { value: "標題" } });
    fireEvent.change(screen.getByLabelText("內容"), { target: { value: "內容" } });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));
    await screen.findByRole("alert");

    fireEvent.change(screen.getByLabelText("內容"), { target: { value: "內容修改中" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables both fields and the button while an add is in flight, preventing a double submit", async () => {
    let resolveAdd!: (result: Awaited<ReturnType<typeof addKnowledgeBaseDocumentFromText>>) => void;
    mockedAddKnowledgeBaseDocumentFromText.mockReturnValueOnce(new Promise((resolve) => (resolveAdd = resolve)));

    render(<KnowledgeDocumentTextInput knowledgeBaseId="kb1" onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("標題"), { target: { value: "標題" } });
    fireEvent.change(screen.getByLabelText("內容"), { target: { value: "內容" } });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "新增" })).toBeDisabled());
    expect(screen.getByLabelText("標題")).toBeDisabled();
    expect(screen.getByLabelText("內容")).toBeDisabled();

    resolveAdd({ ok: true, value: sampleDocument() });
    await waitFor(() => expect(mockedAddKnowledgeBaseDocumentFromText).toHaveBeenCalledTimes(1));
  });

  it("emits attempt and success telemetry sharing the same correlation id, WITHOUT the title or content, but WITH sizeBytes", async () => {
    mockedAddKnowledgeBaseDocumentFromText.mockResolvedValue({
      ok: true,
      value: sampleDocument({ name: "機密標題", content: "機密內容文字", sizeBytes: 42 }),
    });

    render(<KnowledgeDocumentTextInput knowledgeBaseId="kb1" onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("標題"), { target: { value: "機密標題" } });
    fireEvent.change(screen.getByLabelText("內容"), { target: { value: "機密內容文字" } });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));

    await waitFor(() => expect(mockedAddKnowledgeBaseDocumentFromText).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_text_input_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_text_input_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attempt = attemptCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    const success = successCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    expect(attempt[1].correlationId).toBe(success[1].correlationId);
    expect(success[1].properties).toMatchObject({ knowledgeBaseId: "kb1", sizeBytes: 42 });
    for (const call of mockedTrackEvent.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("機密標題");
      expect(JSON.stringify(call)).not.toContain("機密內容文字");
    }
  });

  it("emits failure telemetry with the error code when the add fails", async () => {
    mockedAddKnowledgeBaseDocumentFromText.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "找不到這個知識庫。" },
    });

    render(<KnowledgeDocumentTextInput knowledgeBaseId="kb1" onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("標題"), { target: { value: "標題" } });
    fireEvent.change(screen.getByLabelText("內容"), { target: { value: "內容" } });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_text_input_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("NOT_FOUND");
  });
});
