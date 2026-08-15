import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgeDocumentBulkActions from "./knowledge-document-bulk-actions";
import { archiveKnowledgeBaseDocument, deleteKnowledgeBaseDocument, unarchiveKnowledgeBaseDocument } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/knowledge-documents", () => ({
  archiveKnowledgeBaseDocument: vi.fn(),
  unarchiveKnowledgeBaseDocument: vi.fn(),
  deleteKnowledgeBaseDocument: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedArchive = vi.mocked(archiveKnowledgeBaseDocument);
const mockedUnarchive = vi.mocked(unarchiveKnowledgeBaseDocument);
const mockedDelete = vi.mocked(deleteKnowledgeBaseDocument);
const mockedTrackEvent = vi.mocked(trackEvent);

function archiveOk(id: string) {
  return { ok: true, value: { id, knowledgeBaseId: "kb1", name: `${id}.pdf`, uploadedAt: "2026-08-15T00:00:00.000Z" } } as const;
}
const deleteOk = { ok: true, value: undefined } as const;

beforeEach(() => {
  mockedArchive.mockReset();
  mockedUnarchive.mockReset();
  mockedDelete.mockReset();
  mockedTrackEvent.mockReset();
});

describe("KnowledgeDocumentBulkActions (E05-S030)", () => {
  it("shows the selected count and the 封存所選文件 label while viewing the active view", () => {
    render(<KnowledgeDocumentBulkActions knowledgeBaseId="kb1" documentIds={["doc1", "doc2"]} viewingArchived={false} onCompleted={vi.fn()} />);

    expect(screen.getByText("已選擇 2 份文件")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "封存所選文件" })).toBeInTheDocument();
  });

  it("shows the 取消封存所選文件 label while viewing the archived view", () => {
    render(<KnowledgeDocumentBulkActions knowledgeBaseId="kb1" documentIds={["doc1"]} viewingArchived={true} onCompleted={vi.fn()} />);

    expect(screen.getByRole("button", { name: "取消封存所選文件" })).toBeInTheDocument();
  });

  it("bulk archiving calls archiveKnowledgeBaseDocument (not unarchive) for every selected id, then calls onCompleted", async () => {
    mockedArchive.mockImplementation(async (_kb, docId) => archiveOk(docId));
    const onCompleted = vi.fn();
    render(<KnowledgeDocumentBulkActions knowledgeBaseId="kb1" documentIds={["doc1", "doc2", "doc3"]} viewingArchived={false} onCompleted={onCompleted} />);

    fireEvent.click(screen.getByRole("button", { name: "封存所選文件" }));

    await waitFor(() => expect(mockedArchive).toHaveBeenCalledTimes(3));
    expect(mockedArchive).toHaveBeenNthCalledWith(1, "kb1", "doc1");
    expect(mockedArchive).toHaveBeenNthCalledWith(2, "kb1", "doc2");
    expect(mockedArchive).toHaveBeenNthCalledWith(3, "kb1", "doc3");
    expect(mockedUnarchive).not.toHaveBeenCalled();
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
  });

  it("bulk unarchiving calls unarchiveKnowledgeBaseDocument (not archive) for every selected id", async () => {
    mockedUnarchive.mockImplementation(async (_kb, docId) => archiveOk(docId));
    render(<KnowledgeDocumentBulkActions knowledgeBaseId="kb1" documentIds={["doc1", "doc2"]} viewingArchived={true} onCompleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "取消封存所選文件" }));

    await waitFor(() => expect(mockedUnarchive).toHaveBeenCalledTimes(2));
    expect(mockedArchive).not.toHaveBeenCalled();
  });

  it("a partial archive failure shows the failed count but still calls onCompleted, since some succeeded", async () => {
    mockedArchive
      .mockResolvedValueOnce(archiveOk("doc1"))
      .mockResolvedValueOnce({ ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } })
      .mockResolvedValueOnce(archiveOk("doc3"));
    const onCompleted = vi.fn();
    render(<KnowledgeDocumentBulkActions knowledgeBaseId="kb1" documentIds={["doc1", "doc2", "doc3"]} viewingArchived={false} onCompleted={onCompleted} />);

    fireEvent.click(screen.getByRole("button", { name: "封存所選文件" }));

    expect(await screen.findByText("1 份文件封存失敗，請稍後再試。")).toBeInTheDocument();
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
  });

  it("a total archive failure shows the failed count and does NOT call onCompleted, since nothing changed", async () => {
    mockedArchive.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } });
    const onCompleted = vi.fn();
    render(<KnowledgeDocumentBulkActions knowledgeBaseId="kb1" documentIds={["doc1", "doc2"]} viewingArchived={false} onCompleted={onCompleted} />);

    fireEvent.click(screen.getByRole("button", { name: "封存所選文件" }));

    expect(await screen.findByText("2 份文件封存失敗，請稍後再試。")).toBeInTheDocument();
    await waitFor(() => expect(mockedArchive).toHaveBeenCalledTimes(2));
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("disables both action buttons while a bulk archive is in flight", async () => {
    let resolveFirst!: (value: Awaited<ReturnType<typeof archiveKnowledgeBaseDocument>>) => void;
    mockedArchive.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)));
    render(<KnowledgeDocumentBulkActions knowledgeBaseId="kb1" documentIds={["doc1", "doc2"]} viewingArchived={false} onCompleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "封存所選文件" }));

    expect(screen.getByRole("button", { name: "封存所選文件" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "刪除所選文件" })).toBeDisabled();

    resolveFirst(archiveOk("doc1"));
    mockedArchive.mockImplementation(async (_kb, docId) => archiveOk(docId));
    await waitFor(() => expect(mockedArchive).toHaveBeenCalledTimes(2));
  });

  it("emits bulk archive attempt/success telemetry sharing a correlation id, with the selected count", async () => {
    mockedArchive.mockImplementation(async (_kb, docId) => archiveOk(docId));
    render(<KnowledgeDocumentBulkActions knowledgeBaseId="kb1" documentIds={["doc1", "doc2"]} viewingArchived={false} onCompleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "封存所選文件" }));
    await waitFor(() => expect(mockedArchive).toHaveBeenCalledTimes(2));

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_bulk_archive_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_bulk_archive_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attempt = attemptCall as [string, { correlationId: string; properties: { knowledgeBaseId: string; count: number } }];
    const success = successCall as [string, { correlationId: string; properties: { succeededCount: number } }];
    expect(attempt[1].properties).toEqual({ knowledgeBaseId: "kb1", count: 2 });
    expect(success[1].properties.succeededCount).toBe(2);
    expect(attempt[1].correlationId).toBe(success[1].correlationId);
  });

  it("emits bulk unarchive telemetry (not archive) when toggling from the archived view", async () => {
    mockedUnarchive.mockImplementation(async (_kb, docId) => archiveOk(docId));
    render(<KnowledgeDocumentBulkActions knowledgeBaseId="kb1" documentIds={["doc1"]} viewingArchived={true} onCompleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "取消封存所選文件" }));
    await waitFor(() => expect(mockedUnarchive).toHaveBeenCalled());

    expect(mockedTrackEvent.mock.calls.some((call) => call[0] === "knowledge_base_document_bulk_unarchive_attempt")).toBe(true);
    expect(mockedTrackEvent.mock.calls.some((call) => call[0] === "knowledge_base_document_bulk_archive_attempt")).toBe(false);
  });

  it("clicking 刪除所選文件 shows a confirmation naming the selected count, without deleting anything yet", () => {
    render(<KnowledgeDocumentBulkActions knowledgeBaseId="kb1" documentIds={["doc1", "doc2"]} viewingArchived={false} onCompleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "刪除所選文件" }));

    expect(screen.getByRole("alertdialog", { name: "確認刪除 2 份文件" })).toBeInTheDocument();
    expect(screen.getByText("確定要刪除這 2 份文件嗎？此操作無法復原。")).toBeInTheDocument();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("取消 dismisses the bulk delete confirmation without calling deleteKnowledgeBaseDocument", () => {
    render(<KnowledgeDocumentBulkActions knowledgeBaseId="kb1" documentIds={["doc1"]} viewingArchived={false} onCompleted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "刪除所選文件" }));

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("確認刪除 calls deleteKnowledgeBaseDocument for every selected id, closes the dialog, and calls onCompleted on full success", async () => {
    mockedDelete.mockResolvedValue(deleteOk);
    const onCompleted = vi.fn();
    render(<KnowledgeDocumentBulkActions knowledgeBaseId="kb1" documentIds={["doc1", "doc2"]} viewingArchived={false} onCompleted={onCompleted} />);
    fireEvent.click(screen.getByRole("button", { name: "刪除所選文件" }));

    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledTimes(2));
    expect(mockedDelete).toHaveBeenNthCalledWith(1, "kb1", "doc1");
    expect(mockedDelete).toHaveBeenNthCalledWith(2, "kb1", "doc2");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("a partial bulk delete failure closes the dialog anyway, shows the failed count outside it, and still calls onCompleted", async () => {
    mockedDelete
      .mockResolvedValueOnce(deleteOk)
      .mockResolvedValueOnce({ ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } });
    const onCompleted = vi.fn();
    render(<KnowledgeDocumentBulkActions knowledgeBaseId="kb1" documentIds={["doc1", "doc2"]} viewingArchived={false} onCompleted={onCompleted} />);
    fireEvent.click(screen.getByRole("button", { name: "刪除所選文件" }));
    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByText("1 份文件刪除失敗，請稍後再試。")).toBeInTheDocument();
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("a total bulk delete failure closes the dialog, shows the failed count, and does NOT call onCompleted", async () => {
    mockedDelete.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } });
    const onCompleted = vi.fn();
    render(<KnowledgeDocumentBulkActions knowledgeBaseId="kb1" documentIds={["doc1", "doc2"]} viewingArchived={false} onCompleted={onCompleted} />);
    fireEvent.click(screen.getByRole("button", { name: "刪除所選文件" }));
    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByText("2 份文件刪除失敗，請稍後再試。")).toBeInTheDocument();
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("emits bulk delete attempt/success telemetry sharing a correlation id, with the selected count", async () => {
    mockedDelete.mockResolvedValue(deleteOk);
    render(<KnowledgeDocumentBulkActions knowledgeBaseId="kb1" documentIds={["doc1", "doc2"]} viewingArchived={false} onCompleted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "刪除所選文件" }));
    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledTimes(2));

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_bulk_delete_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_bulk_delete_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attempt = attemptCall as [string, { correlationId: string; properties: { count: number } }];
    const success = successCall as [string, { correlationId: string; properties: { succeededCount: number } }];
    expect(attempt[1].properties.count).toBe(2);
    expect(success[1].properties.succeededCount).toBe(2);
    expect(attempt[1].correlationId).toBe(success[1].correlationId);
  });
});
