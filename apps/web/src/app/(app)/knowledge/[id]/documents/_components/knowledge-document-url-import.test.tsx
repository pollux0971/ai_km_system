import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgeDocumentUrlImport from "./knowledge-document-url-import";
import { addKnowledgeBaseDocumentFromUrl } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/knowledge-documents", () => ({
  addKnowledgeBaseDocumentFromUrl: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedAddKnowledgeBaseDocumentFromUrl = vi.mocked(addKnowledgeBaseDocumentFromUrl);
const mockedTrackEvent = vi.mocked(trackEvent);

function sampleDocument(overrides: Partial<{ id: string; knowledgeBaseId: string; name: string; sizeBytes?: number; uploadedAt: string }> = {}) {
  return {
    id: "doc1",
    knowledgeBaseId: "kb1",
    name: "https://example.com/a.pdf",
    uploadedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockedAddKnowledgeBaseDocumentFromUrl.mockReset();
  mockedTrackEvent.mockReset();
});

describe("KnowledgeDocumentUrlImport (E05-S014)", () => {
  it("shows a label, url input, and a disabled 匯入 button when empty", () => {
    render(<KnowledgeDocumentUrlImport knowledgeBaseId="kb1" onImported={vi.fn()} />);

    expect(screen.getByLabelText("從網址匯入")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "匯入" })).toBeDisabled();
  });

  it("enables the 匯入 button once a non-whitespace URL is typed", () => {
    render(<KnowledgeDocumentUrlImport knowledgeBaseId="kb1" onImported={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("從網址匯入"), { target: { value: "https://example.com/a.pdf" } });

    expect(screen.getByRole("button", { name: "匯入" })).toBeEnabled();
  });

  it("imports the entered URL, clears the input, and notifies the parent on success", async () => {
    mockedAddKnowledgeBaseDocumentFromUrl.mockResolvedValue({ ok: true, value: sampleDocument() });
    const onImported = vi.fn();

    render(<KnowledgeDocumentUrlImport knowledgeBaseId="kb1" onImported={onImported} />);
    fireEvent.change(screen.getByLabelText("從網址匯入"), { target: { value: "https://example.com/a.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "匯入" }));

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(mockedAddKnowledgeBaseDocumentFromUrl).toHaveBeenCalledWith("kb1", "https://example.com/a.pdf");
    expect(screen.getByLabelText("從網址匯入")).toHaveValue("");
  });

  it("shows the SPECIFIC validation message (not a generic string) and keeps the entered URL when import fails", async () => {
    mockedAddKnowledgeBaseDocumentFromUrl.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "請輸入有效的網址。" },
    });
    const onImported = vi.fn();

    render(<KnowledgeDocumentUrlImport knowledgeBaseId="kb1" onImported={onImported} />);
    fireEvent.change(screen.getByLabelText("從網址匯入"), { target: { value: "not a url" } });
    fireEvent.click(screen.getByRole("button", { name: "匯入" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("請輸入有效的網址。");
    expect(screen.getByLabelText("從網址匯入")).toHaveValue("not a url");
    expect(onImported).not.toHaveBeenCalled();
  });

  it("shows a different specific message for a NOT_FOUND failure, proving the message is not hardcoded to one string", async () => {
    mockedAddKnowledgeBaseDocumentFromUrl.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "找不到這個知識庫。" },
    });

    render(<KnowledgeDocumentUrlImport knowledgeBaseId="kb1" onImported={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("從網址匯入"), { target: { value: "https://example.com/a.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "匯入" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到這個知識庫。");
  });

  it("clears a previous error as soon as the URL is edited again", async () => {
    mockedAddKnowledgeBaseDocumentFromUrl.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "請輸入有效的網址。" },
    });

    render(<KnowledgeDocumentUrlImport knowledgeBaseId="kb1" onImported={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("從網址匯入"), { target: { value: "not a url" } });
    fireEvent.click(screen.getByRole("button", { name: "匯入" }));
    await screen.findByRole("alert");

    fireEvent.change(screen.getByLabelText("從網址匯入"), { target: { value: "not a url either" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables the input and 匯入 button while an import is in flight, preventing a double submit", async () => {
    let resolveImport!: (result: Awaited<ReturnType<typeof addKnowledgeBaseDocumentFromUrl>>) => void;
    mockedAddKnowledgeBaseDocumentFromUrl.mockReturnValueOnce(new Promise((resolve) => (resolveImport = resolve)));

    render(<KnowledgeDocumentUrlImport knowledgeBaseId="kb1" onImported={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("從網址匯入"), { target: { value: "https://example.com/a.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "匯入" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "匯入" })).toBeDisabled());
    expect(screen.getByLabelText("從網址匯入")).toBeDisabled();

    resolveImport({ ok: true, value: sampleDocument() });
    await waitFor(() => expect(mockedAddKnowledgeBaseDocumentFromUrl).toHaveBeenCalledTimes(1));
  });

  it("emits attempt and success telemetry sharing the same correlation id, WITHOUT including the URL itself", async () => {
    mockedAddKnowledgeBaseDocumentFromUrl.mockResolvedValue({
      ok: true,
      value: sampleDocument({ name: "https://internal.example.com/secret-project-plan.pdf" }),
    });

    render(<KnowledgeDocumentUrlImport knowledgeBaseId="kb1" onImported={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("從網址匯入"), {
      target: { value: "https://internal.example.com/secret-project-plan.pdf" },
    });
    fireEvent.click(screen.getByRole("button", { name: "匯入" }));

    await waitFor(() => expect(mockedAddKnowledgeBaseDocumentFromUrl).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_url_import_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_url_import_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attempt = attemptCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    const success = successCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    expect(attempt[1].correlationId).toBe(success[1].correlationId);
    // The whole point of this test: no call anywhere included the actual URL.
    for (const call of mockedTrackEvent.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("secret-project-plan");
    }
  });

  it("emits failure telemetry with the error code when the import fails", async () => {
    mockedAddKnowledgeBaseDocumentFromUrl.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "請輸入有效的網址。" },
    });

    render(<KnowledgeDocumentUrlImport knowledgeBaseId="kb1" onImported={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("從網址匯入"), { target: { value: "not a url" } });
    fireEvent.click(screen.getByRole("button", { name: "匯入" }));

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_url_import_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("VALIDATION_ERROR");
  });
});
