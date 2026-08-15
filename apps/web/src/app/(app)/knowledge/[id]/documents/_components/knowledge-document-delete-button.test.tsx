import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgeDocumentDeleteButton from "./knowledge-document-delete-button";
import { deleteKnowledgeBaseDocument } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/knowledge-documents", () => ({
  deleteKnowledgeBaseDocument: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedDeleteKnowledgeBaseDocument = vi.mocked(deleteKnowledgeBaseDocument);
const mockedTrackEvent = vi.mocked(trackEvent);

beforeEach(() => {
  mockedDeleteKnowledgeBaseDocument.mockReset();
  mockedTrackEvent.mockReset();
});

describe("KnowledgeDocumentDeleteButton (E05-S026)", () => {
  it("shows a 刪除文件 button initially, with no confirmation prompt", () => {
    render(<KnowledgeDocumentDeleteButton knowledgeBaseId="kb1" documentId="doc1" name="測試文件.pdf" onDeleted={vi.fn()} />);

    expect(screen.getByRole("button", { name: "刪除文件" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("clicking 刪除文件 shows a confirmation prompt naming the document, without deleting anything yet", () => {
    render(<KnowledgeDocumentDeleteButton knowledgeBaseId="kb1" documentId="doc1" name="測試文件.pdf" onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "刪除文件" }));

    expect(screen.getByRole("alertdialog", { name: "確認刪除文件：測試文件.pdf" })).toBeInTheDocument();
    expect(screen.getByText("確定要刪除「測試文件.pdf」嗎？此操作無法復原。")).toBeInTheDocument();
    expect(mockedDeleteKnowledgeBaseDocument).not.toHaveBeenCalled();
  });

  it("取消 dismisses the confirmation without calling deleteKnowledgeBaseDocument", () => {
    render(<KnowledgeDocumentDeleteButton knowledgeBaseId="kb1" documentId="doc1" name="測試文件.pdf" onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "刪除文件" }));

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刪除文件" })).toBeInTheDocument();
    expect(mockedDeleteKnowledgeBaseDocument).not.toHaveBeenCalled();
  });

  it("確認刪除 calls deleteKnowledgeBaseDocument and then onDeleted, with no navigation side effect", async () => {
    mockedDeleteKnowledgeBaseDocument.mockResolvedValue({ ok: true, value: undefined });
    const onDeleted = vi.fn();
    render(<KnowledgeDocumentDeleteButton knowledgeBaseId="kb1" documentId="doc1" name="測試文件.pdf" onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("button", { name: "刪除文件" }));

    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(mockedDeleteKnowledgeBaseDocument).toHaveBeenCalledWith("kb1", "doc1");
  });

  it("shows an error message and stays on the confirmation view when deleteKnowledgeBaseDocument fails, without calling onDeleted", async () => {
    mockedDeleteKnowledgeBaseDocument.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } });
    const onDeleted = vi.fn();
    render(<KnowledgeDocumentDeleteButton knowledgeBaseId="kb1" documentId="doc1" name="測試文件.pdf" onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("button", { name: "刪除文件" }));

    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("刪除文件失敗，請稍後再試。");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("disables 確認刪除 and 取消 while the delete is in flight", async () => {
    let resolveDelete!: (value: Awaited<ReturnType<typeof deleteKnowledgeBaseDocument>>) => void;
    mockedDeleteKnowledgeBaseDocument.mockReturnValue(new Promise((resolve) => (resolveDelete = resolve)));
    render(<KnowledgeDocumentDeleteButton knowledgeBaseId="kb1" documentId="doc1" name="測試文件.pdf" onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "刪除文件" }));

    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    expect(screen.getByRole("button", { name: "確認刪除" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();

    resolveDelete({ ok: true, value: undefined });
    await waitFor(() => expect(mockedDeleteKnowledgeBaseDocument).toHaveBeenCalledTimes(1));
  });

  it("re-opening the confirmation after cancelling still shows no error from a previous attempt", async () => {
    mockedDeleteKnowledgeBaseDocument.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } });
    render(<KnowledgeDocumentDeleteButton knowledgeBaseId="kb1" documentId="doc1" name="測試文件.pdf" onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "刪除文件" }));
    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    fireEvent.click(screen.getByRole("button", { name: "刪除文件" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("emits attempt and success telemetry sharing the same correlation id, including documentId but never the document name", async () => {
    mockedDeleteKnowledgeBaseDocument.mockResolvedValue({ ok: true, value: undefined });
    render(<KnowledgeDocumentDeleteButton knowledgeBaseId="kb1" documentId="doc1" name="機密專案文件.pdf" onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "刪除文件" }));

    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));
    await waitFor(() => expect(mockedDeleteKnowledgeBaseDocument).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_delete_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_delete_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attempt = attemptCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    const success = successCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    expect(attempt[1].correlationId).toBe(success[1].correlationId);
    expect(attempt[1].properties).toEqual({ knowledgeBaseId: "kb1", documentId: "doc1" });
    for (const call of mockedTrackEvent.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("機密專案文件");
    }
  });

  it("emits failure telemetry with the error code when the delete fails", async () => {
    mockedDeleteKnowledgeBaseDocument.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "down" } });
    render(<KnowledgeDocumentDeleteButton knowledgeBaseId="kb1" documentId="doc1" name="測試文件.pdf" onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "刪除文件" }));

    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));
    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_delete_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("NOT_FOUND");
  });
});
