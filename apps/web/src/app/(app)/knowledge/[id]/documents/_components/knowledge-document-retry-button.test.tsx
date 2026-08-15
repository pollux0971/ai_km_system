import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgeDocumentRetryButton from "./knowledge-document-retry-button";
import { retryDocumentProcessing } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/knowledge-documents", () => ({
  retryDocumentProcessing: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

// E05-S021 reuses parse-progress.ts/index-progress.ts (E05-S018/S019)
// for its own pending delay — mocked wholesale here for the same
// "consuming-component tests stay fast/deterministic" reason
// knowledge-document-upload.test.tsx already established for both.
vi.mock("@/lib/parse-progress", () => ({
  simulateParseStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/index-progress", () => ({
  simulateIndexStep: vi.fn().mockResolvedValue(undefined),
}));

const mockedRetryDocumentProcessing = vi.mocked(retryDocumentProcessing);
const mockedTrackEvent = vi.mocked(trackEvent);

function sampleDocument(overrides: Partial<{ id: string; knowledgeBaseId: string; name: string; sizeBytes: number; uploadedAt: string }> = {}) {
  return {
    id: "doc1",
    knowledgeBaseId: "kb1",
    name: "a.pdf",
    sizeBytes: 500,
    uploadedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockedRetryDocumentProcessing.mockReset();
  mockedTrackEvent.mockReset();
});

describe("KnowledgeDocumentRetryButton (E05-S021)", () => {
  it("shows a 重試 button", () => {
    render(<KnowledgeDocumentRetryButton knowledgeBaseId="kb1" documentId="doc1" onRetried={vi.fn()} />);

    expect(screen.getByRole("button", { name: "重試" })).toBeInTheDocument();
  });

  it("calls retryDocumentProcessing with the correct knowledge base and document ids", async () => {
    mockedRetryDocumentProcessing.mockResolvedValue({ ok: true, value: sampleDocument() });

    render(<KnowledgeDocumentRetryButton knowledgeBaseId="kb1" documentId="doc1" onRetried={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "重試" }));

    await waitFor(() => expect(mockedRetryDocumentProcessing).toHaveBeenCalledWith("kb1", "doc1"));
  });

  it("shows 重試中… and disables the button while pending, preventing a double click", async () => {
    let resolveRetry!: (result: Awaited<ReturnType<typeof retryDocumentProcessing>>) => void;
    mockedRetryDocumentProcessing.mockReturnValueOnce(new Promise((resolve) => (resolveRetry = resolve)));

    render(<KnowledgeDocumentRetryButton knowledgeBaseId="kb1" documentId="doc1" onRetried={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "重試" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "重試中…" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "重試中…" }));

    resolveRetry({ ok: true, value: sampleDocument() });
    await waitFor(() => expect(mockedRetryDocumentProcessing).toHaveBeenCalledTimes(1));
  });

  it("calls onRetried once the retry (and its simulated re-processing delay) resolves successfully", async () => {
    mockedRetryDocumentProcessing.mockResolvedValue({ ok: true, value: sampleDocument() });
    const onRetried = vi.fn();

    render(<KnowledgeDocumentRetryButton knowledgeBaseId="kb1" documentId="doc1" onRetried={onRetried} />);
    fireEvent.click(screen.getByRole("button", { name: "重試" }));

    await waitFor(() => expect(onRetried).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "重試" })).not.toBeDisabled();
  });

  it("shows the SPECIFIC error message and does not call onRetried when retryDocumentProcessing rejects", async () => {
    mockedRetryDocumentProcessing.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "這份文件目前不是處理失敗狀態，不需要重試。" } });
    const onRetried = vi.fn();

    render(<KnowledgeDocumentRetryButton knowledgeBaseId="kb1" documentId="doc1" onRetried={onRetried} />);
    fireEvent.click(screen.getByRole("button", { name: "重試" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("這份文件目前不是處理失敗狀態，不需要重試。");
    expect(onRetried).not.toHaveBeenCalled();
  });

  it("shows a different specific message for a NOT_FOUND failure, proving the message is not hardcoded", async () => {
    mockedRetryDocumentProcessing.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } });

    render(<KnowledgeDocumentRetryButton knowledgeBaseId="kb1" documentId="doc1" onRetried={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "重試" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到這份文件。");
  });

  it("clears a previous error and re-enables retry when clicked again", async () => {
    mockedRetryDocumentProcessing.mockResolvedValueOnce({ ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } });
    mockedRetryDocumentProcessing.mockResolvedValueOnce({ ok: true, value: sampleDocument() });

    render(<KnowledgeDocumentRetryButton knowledgeBaseId="kb1" documentId="doc1" onRetried={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "重試" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await waitFor(() => expect(mockedRetryDocumentProcessing).toHaveBeenCalledTimes(2));
  });

  it("emits attempt and success telemetry sharing the same correlation id, including documentId but never the document's name", async () => {
    mockedRetryDocumentProcessing.mockResolvedValue({ ok: true, value: sampleDocument({ name: "機密專案報告.pdf" }) });

    render(<KnowledgeDocumentRetryButton knowledgeBaseId="kb1" documentId="doc1" onRetried={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "重試" }));

    await waitFor(() => expect(mockedRetryDocumentProcessing).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_retry_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_retry_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attempt = attemptCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    const success = successCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    expect(attempt[1].correlationId).toBe(success[1].correlationId);
    expect(attempt[1].properties).toEqual({ knowledgeBaseId: "kb1", documentId: "doc1" });
    for (const call of mockedTrackEvent.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("機密專案報告");
    }
  });

  it("emits failure telemetry with the error code when retry fails", async () => {
    mockedRetryDocumentProcessing.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "down" } });

    render(<KnowledgeDocumentRetryButton knowledgeBaseId="kb1" documentId="doc1" onRetried={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "重試" }));

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_retry_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("VALIDATION_ERROR");
  });
});
