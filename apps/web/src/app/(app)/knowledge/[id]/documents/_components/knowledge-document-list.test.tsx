import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import KnowledgeDocumentList from "./knowledge-document-list";
import { getKnowledgeBase } from "@/lib/knowledge-bases";
import {
  addKnowledgeBaseDocument,
  addKnowledgeBaseDocumentFromText,
  addKnowledgeBaseDocumentFromUrl,
  archiveKnowledgeBaseDocument,
  deleteKnowledgeBaseDocument,
  listKnowledgeBaseDocuments,
  renameKnowledgeBaseDocument,
  retryDocumentProcessing,
  unarchiveKnowledgeBaseDocument,
} from "@/lib/knowledge-documents";

vi.mock("@/lib/knowledge-bases", () => ({
  getKnowledgeBase: vi.fn(),
}));

vi.mock("@/lib/knowledge-documents", () => ({
  listKnowledgeBaseDocuments: vi.fn(),
  addKnowledgeBaseDocument: vi.fn(),
  addKnowledgeBaseDocumentFromUrl: vi.fn(),
  addKnowledgeBaseDocumentFromText: vi.fn(),
  retryDocumentProcessing: vi.fn(),
  renameKnowledgeBaseDocument: vi.fn(),
  archiveKnowledgeBaseDocument: vi.fn(),
  unarchiveKnowledgeBaseDocument: vi.fn(),
  deleteKnowledgeBaseDocument: vi.fn(),
}));

// E05-S017/S018/S019: this file renders the REAL KnowledgeDocumentUpload
// (not a mock of it) to exercise the full upload flow end-to-end, so
// its own real per-file delay primitives need the same wholesale-mock
// treatment knowledge-document-upload.test.tsx already gives them —
// otherwise a real upload here waits out real wall-clock time (500ms
// per phase) that can exceed RTL's default waitFor timeout, exactly
// what started happening once S018 stacked a second real phase on top
// of S017's first one.
vi.mock("@/lib/upload-progress", () => ({
  simulateUploadStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/parse-progress", () => ({
  simulateParseStep: vi.fn().mockResolvedValue(undefined),
}));

// E05-S019: mocked upfront alongside its two siblings above (learned
// from S018's own FIX cycle, where this exact gap — a real delay
// primitive left unmocked in this file — went unnoticed until stacking
// a second phase pushed the real wait past RTL's default timeout;
// adding this one proactively rather than waiting to rediscover the
// same problem a third time).
vi.mock("@/lib/index-progress", () => ({
  simulateIndexStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedGetKnowledgeBase = vi.mocked(getKnowledgeBase);
const mockedListKnowledgeBaseDocuments = vi.mocked(listKnowledgeBaseDocuments);
const mockedAddKnowledgeBaseDocument = vi.mocked(addKnowledgeBaseDocument);
const mockedAddKnowledgeBaseDocumentFromUrl = vi.mocked(addKnowledgeBaseDocumentFromUrl);
const mockedAddKnowledgeBaseDocumentFromText = vi.mocked(addKnowledgeBaseDocumentFromText);
const mockedRetryDocumentProcessing = vi.mocked(retryDocumentProcessing);
const mockedRenameKnowledgeBaseDocument = vi.mocked(renameKnowledgeBaseDocument);
const mockedArchiveKnowledgeBaseDocument = vi.mocked(archiveKnowledgeBaseDocument);
const mockedUnarchiveKnowledgeBaseDocument = vi.mocked(unarchiveKnowledgeBaseDocument);
const mockedDeleteKnowledgeBaseDocument = vi.mocked(deleteKnowledgeBaseDocument);

const sampleKnowledgeBase = {
  id: "kb1",
  name: "研發部門知識庫",
  description: "內部技術文件。",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

beforeEach(() => {
  mockedGetKnowledgeBase.mockReset();
  mockedListKnowledgeBaseDocuments.mockReset();
  mockedAddKnowledgeBaseDocument.mockReset();
  mockedAddKnowledgeBaseDocumentFromUrl.mockReset();
  mockedAddKnowledgeBaseDocumentFromText.mockReset();
  mockedRetryDocumentProcessing.mockReset();
  mockedRenameKnowledgeBaseDocument.mockReset();
  mockedArchiveKnowledgeBaseDocument.mockReset();
  mockedUnarchiveKnowledgeBaseDocument.mockReset();
  mockedDeleteKnowledgeBaseDocument.mockReset();
});

describe("KnowledgeDocumentList (E05-S010)", () => {
  it("shows a loading state before the knowledge base resolves", () => {
    mockedGetKnowledgeBase.mockReturnValue(new Promise(() => {}));

    render(<KnowledgeDocumentList id="kb1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows a distinct error state when loading the knowledge base fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<KnowledgeDocumentList id="kb1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入知識庫的文件列表。");
  });

  it("shows a distinct not-found state (not the generic error) when the id doesn't match anything", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: null });

    render(<KnowledgeDocumentList id="does-not-exist" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到您要的內容。");
  });

  it("does not call listKnowledgeBaseDocuments when the knowledge base is not found", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: null });

    render(<KnowledgeDocumentList id="does-not-exist" />);
    await screen.findByRole("alert");

    expect(mockedListKnowledgeBaseDocuments).not.toHaveBeenCalled();
  });

  it("does not call listKnowledgeBaseDocuments when loading the knowledge base itself fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByRole("alert");

    expect(mockedListKnowledgeBaseDocuments).not.toHaveBeenCalled();
  });

  it("shows a distinct error state when loading the document list itself fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<KnowledgeDocumentList id="kb1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入知識庫的文件列表。");
  });

  it("shows the knowledge base's name in the heading once loaded", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({ ok: true, value: [] });

    render(<KnowledgeDocumentList id="kb1" />);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("研發部門知識庫");
  });

  it("shows a distinct empty state when the knowledge base has no documents yet", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({ ok: true, value: [] });

    render(<KnowledgeDocumentList id="kb1" />);

    expect(await screen.findByText("這個知識庫尚無文件。")).toBeInTheDocument();
  });

  it("lists each document's name, formatted size, and upload time", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [
        { id: "doc1", knowledgeBaseId: "kb1", name: "保固條款.pdf", sizeBytes: 245_000, uploadedAt: "2026-08-10T02:00:00.000Z" },
        { id: "doc2", knowledgeBaseId: "kb1", name: "設備手冊.pdf", sizeBytes: 1_258_000, uploadedAt: "2026-08-11T06:30:00.000Z" },
      ],
    });

    render(<KnowledgeDocumentList id="kb1" />);

    expect(await screen.findByText("保固條款.pdf")).toBeInTheDocument();
    expect(screen.getByText("239.3 KB")).toBeInTheDocument();
    expect(screen.getByText("設備手冊.pdf")).toBeInTheDocument();
    expect(screen.getByText("1.2 MB")).toBeInTheDocument();
    expect(document.querySelectorAll("time")).toHaveLength(2);
  });

  it("formats a sub-1KB size in bytes", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [{ id: "doc1", knowledgeBaseId: "kb1", name: "小檔案.txt", sizeBytes: 512, uploadedAt: "2026-08-10T02:00:00.000Z" }],
    });

    render(<KnowledgeDocumentList id="kb1" />);

    expect(await screen.findByText("512 B")).toBeInTheDocument();
  });

  it("does not show the empty-state message when documents are present", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [{ id: "doc1", knowledgeBaseId: "kb1", name: "保固條款.pdf", sizeBytes: 245_000, uploadedAt: "2026-08-10T02:00:00.000Z" }],
    });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("保固條款.pdf");

    expect(screen.queryByText("這個知識庫尚無文件。")).not.toBeInTheDocument();
  });

  it("shows a 返回知識庫詳情 link pointing back at /knowledge/{id}", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({ ok: true, value: [] });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("這個知識庫尚無文件。");

    expect(screen.getByRole("link", { name: "返回知識庫詳情" })).toHaveAttribute("href", "/knowledge/kb1");
  });

  it("calls listKnowledgeBaseDocuments with the given id, only after the knowledge base resolves", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({ ok: true, value: [] });

    render(<KnowledgeDocumentList id="kb-sample-2" />);
    await screen.findByText("這個知識庫尚無文件。");

    expect(mockedListKnowledgeBaseDocuments).toHaveBeenCalledWith("kb-sample-2", false);
  });

  it("shows the E05-S011 upload widget once loaded", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({ ok: true, value: [] });

    render(<KnowledgeDocumentList id="kb1" />);

    expect(await screen.findByLabelText("上傳文件")).toBeInTheDocument();
  });

  it("refreshes the document list after a successful upload — a document that appears only in the SECOND listKnowledgeBaseDocuments call shows up without a reload", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockResolvedValueOnce({
        ok: true,
        value: [{ id: "doc1", knowledgeBaseId: "kb1", name: "新上傳的檔案.pdf", sizeBytes: 1000, uploadedAt: "2026-08-15T00:00:00.000Z" }],
      });
    mockedAddKnowledgeBaseDocument.mockResolvedValue({
      ok: true,
      value: { id: "doc1", knowledgeBaseId: "kb1", name: "新上傳的檔案.pdf", sizeBytes: 1000, uploadedAt: "2026-08-15T00:00:00.000Z" },
    });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("這個知識庫尚無文件。");

    const file = new File([new Uint8Array(1000)], "新上傳的檔案.pdf");
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(screen.getByText("新上傳的檔案.pdf")).toBeInTheDocument());
    expect(screen.queryByText("這個知識庫尚無文件。")).not.toBeInTheDocument();
    expect(mockedListKnowledgeBaseDocuments).toHaveBeenCalledTimes(2);
  });

  it("shows the E05-S014 URL import widget once loaded, alongside the upload widget", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({ ok: true, value: [] });

    render(<KnowledgeDocumentList id="kb1" />);

    expect(await screen.findByLabelText("從網址匯入")).toBeInTheDocument();
    expect(screen.getByLabelText("上傳文件")).toBeInTheDocument();
  });

  it("does not render a size line for a document with no sizeBytes (a URL-imported document)", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [{ id: "doc1", knowledgeBaseId: "kb1", name: "https://example.com/report.pdf", uploadedAt: "2026-08-10T02:00:00.000Z" }],
    });

    render(<KnowledgeDocumentList id="kb1" />);

    expect(await screen.findByText("https://example.com/report.pdf")).toBeInTheDocument();
    expect(screen.queryByText(/^\d+(\.\d+)? (B|KB|MB)$/)).not.toBeInTheDocument();
  });

  it("refreshes the document list after a successful URL import, same as after a file upload", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockResolvedValueOnce({
        ok: true,
        value: [{ id: "doc1", knowledgeBaseId: "kb1", name: "https://example.com/imported.pdf", uploadedAt: "2026-08-15T00:00:00.000Z" }],
      });
    mockedAddKnowledgeBaseDocumentFromUrl.mockResolvedValue({
      ok: true,
      value: { id: "doc1", knowledgeBaseId: "kb1", name: "https://example.com/imported.pdf", uploadedAt: "2026-08-15T00:00:00.000Z" },
    });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("這個知識庫尚無文件。");

    fireEvent.change(screen.getByLabelText("從網址匯入"), { target: { value: "https://example.com/imported.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "匯入" }));

    await waitFor(() => expect(screen.getByText("https://example.com/imported.pdf")).toBeInTheDocument());
    expect(screen.queryByText("這個知識庫尚無文件。")).not.toBeInTheDocument();
    expect(mockedListKnowledgeBaseDocuments).toHaveBeenCalledTimes(2);
  });

  it("shows the E05-S015 text-input widget once loaded, alongside upload and URL import", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({ ok: true, value: [] });

    render(<KnowledgeDocumentList id="kb1" />);

    expect(await screen.findByLabelText("標題")).toBeInTheDocument();
    expect(screen.getByLabelText("內容")).toBeInTheDocument();
    expect(screen.getByLabelText("上傳文件")).toBeInTheDocument();
    expect(screen.getByLabelText("從網址匯入")).toBeInTheDocument();
  });

  it("refreshes the document list after successfully adding text knowledge, same as after upload/URL import", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockResolvedValueOnce({
        ok: true,
        value: [{ id: "doc1", knowledgeBaseId: "kb1", name: "退貨政策", content: "7 天內可退貨。", sizeBytes: 20, uploadedAt: "2026-08-15T00:00:00.000Z" }],
      });
    mockedAddKnowledgeBaseDocumentFromText.mockResolvedValue({
      ok: true,
      value: { id: "doc1", knowledgeBaseId: "kb1", name: "退貨政策", content: "7 天內可退貨。", sizeBytes: 20, uploadedAt: "2026-08-15T00:00:00.000Z" },
    });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("這個知識庫尚無文件。");

    fireEvent.change(screen.getByLabelText("標題"), { target: { value: "退貨政策" } });
    fireEvent.change(screen.getByLabelText("內容"), { target: { value: "7 天內可退貨。" } });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));

    await waitFor(() => expect(screen.getByText("退貨政策")).toBeInTheDocument());
    expect(screen.queryByText("這個知識庫尚無文件。")).not.toBeInTheDocument();
    expect(mockedListKnowledgeBaseDocuments).toHaveBeenCalledTimes(2);
  });
});

describe("KnowledgeDocumentList — processing failure state (E05-S020)", () => {
  it("shows a 處理失敗 indicator for a document with status failed", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [{ id: "doc1", knowledgeBaseId: "kb1", name: "損毀檔案.pdf", sizeBytes: 500, status: "failed", uploadedAt: "2026-08-15T00:00:00.000Z" }],
    });

    render(<KnowledgeDocumentList id="kb1" />);

    expect(await screen.findByText("損毀檔案.pdf")).toBeInTheDocument();
    expect(screen.getByText("處理失敗")).toBeInTheDocument();
  });

  it("does not show 處理失敗 for a document without a failed status", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [{ id: "doc1", knowledgeBaseId: "kb1", name: "正常檔案.pdf", sizeBytes: 500, uploadedAt: "2026-08-15T00:00:00.000Z" }],
    });

    render(<KnowledgeDocumentList id="kb1" />);

    await screen.findByText("正常檔案.pdf");
    expect(screen.queryByText("處理失敗")).not.toBeInTheDocument();
  });

  it("shows 處理失敗 only next to the failed document, not the others, in a mixed list", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [
        { id: "doc1", knowledgeBaseId: "kb1", name: "正常一.pdf", sizeBytes: 100, uploadedAt: "2026-08-15T00:00:00.000Z" },
        { id: "doc2", knowledgeBaseId: "kb1", name: "損毀二.pdf", sizeBytes: 200, status: "failed", uploadedAt: "2026-08-15T00:00:00.000Z" },
        { id: "doc3", knowledgeBaseId: "kb1", name: "正常三.pdf", sizeBytes: 300, uploadedAt: "2026-08-15T00:00:00.000Z" },
      ],
    });

    render(<KnowledgeDocumentList id="kb1" />);

    await screen.findByText("損毀二.pdf");
    expect(screen.getAllByText("處理失敗")).toHaveLength(1);
  });
});

describe("KnowledgeDocumentList — retry processing action (E05-S021)", () => {
  it("shows a 重試 button next to a failed document", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [{ id: "doc1", knowledgeBaseId: "kb1", name: "損毀檔案.pdf", sizeBytes: 500, status: "failed", uploadedAt: "2026-08-15T00:00:00.000Z" }],
    });

    render(<KnowledgeDocumentList id="kb1" />);

    await screen.findByText("損毀檔案.pdf");
    expect(screen.getByRole("button", { name: "重試" })).toBeInTheDocument();
  });

  it("does not show a 重試 button next to a document that isn't failed", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [{ id: "doc1", knowledgeBaseId: "kb1", name: "正常檔案.pdf", sizeBytes: 500, uploadedAt: "2026-08-15T00:00:00.000Z" }],
    });

    render(<KnowledgeDocumentList id="kb1" />);

    await screen.findByText("正常檔案.pdf");
    expect(screen.queryByRole("button", { name: "重試" })).not.toBeInTheDocument();
  });

  it("a successful retry refreshes the list, clearing 處理失敗 and its 重試 button once the document is ready", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments
      .mockResolvedValueOnce({
        ok: true,
        value: [{ id: "doc1", knowledgeBaseId: "kb1", name: "損毀檔案.pdf", sizeBytes: 500, status: "failed", uploadedAt: "2026-08-15T00:00:00.000Z" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [{ id: "doc1", knowledgeBaseId: "kb1", name: "損毀檔案.pdf", sizeBytes: 500, uploadedAt: "2026-08-15T00:00:00.000Z" }],
      });
    mockedRetryDocumentProcessing.mockResolvedValue({
      ok: true,
      value: { id: "doc1", knowledgeBaseId: "kb1", name: "損毀檔案.pdf", sizeBytes: 500, uploadedAt: "2026-08-15T00:00:00.000Z" },
    });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("處理失敗");

    fireEvent.click(screen.getByRole("button", { name: "重試" }));

    await waitFor(() => expect(mockedListKnowledgeBaseDocuments).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("處理失敗")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重試" })).not.toBeInTheDocument();
  });
});

describe("KnowledgeDocumentList — document preview (E05-S022)", () => {
  it("shows a 預覽 toggle for every document, and expanding a text-sourced one reveals its real stored content", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [
        { id: "doc1", knowledgeBaseId: "kb1", name: "上傳的檔案.pdf", sizeBytes: 500, uploadedAt: "2026-08-15T00:00:00.000Z" },
        { id: "doc2", knowledgeBaseId: "kb1", name: "打的知識", content: "這是真實輸入的內容。", sizeBytes: 60, uploadedAt: "2026-08-15T00:00:00.000Z" },
      ],
    });

    render(<KnowledgeDocumentList id="kb1" />);

    await screen.findByText("上傳的檔案.pdf");
    const previewButtons = screen.getAllByRole("button", { name: "預覽" });
    expect(previewButtons).toHaveLength(2);

    fireEvent.click(previewButtons[1]!);
    expect(screen.getByText("這是真實輸入的內容。")).toBeInTheDocument();
  });

  it("shows an honest 無法預覽 message for a file-sourced document with no stored content", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [{ id: "doc1", knowledgeBaseId: "kb1", name: "上傳的檔案.pdf", sizeBytes: 500, uploadedAt: "2026-08-15T00:00:00.000Z" }],
    });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("上傳的檔案.pdf");

    fireEvent.click(screen.getByRole("button", { name: "預覽" }));

    expect(screen.getByText("此文件目前無法預覽。")).toBeInTheDocument();
  });
});

describe("KnowledgeDocumentList — document metadata editor (E05-S023)", () => {
  it("shows a 重新命名 control for every document in the list", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [
        { id: "doc1", knowledgeBaseId: "kb1", name: "第一份.pdf", sizeBytes: 100, uploadedAt: "2026-08-15T00:00:00.000Z" },
        { id: "doc2", knowledgeBaseId: "kb1", name: "第二份.pdf", sizeBytes: 200, uploadedAt: "2026-08-15T00:00:00.000Z" },
      ],
    });

    render(<KnowledgeDocumentList id="kb1" />);

    await screen.findByText("第一份.pdf");
    expect(screen.getAllByRole("button", { name: "重新命名" })).toHaveLength(2);
  });

  it("renaming a document updates its displayed name in place, without disturbing the others", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [
        { id: "doc1", knowledgeBaseId: "kb1", name: "舊名稱.pdf", sizeBytes: 100, uploadedAt: "2026-08-15T00:00:00.000Z" },
        { id: "doc2", knowledgeBaseId: "kb1", name: "不受影響.pdf", sizeBytes: 200, uploadedAt: "2026-08-15T00:00:00.000Z" },
      ],
    });
    mockedRenameKnowledgeBaseDocument.mockResolvedValue({
      ok: true,
      value: { id: "doc1", knowledgeBaseId: "kb1", name: "新名稱.pdf", sizeBytes: 100, uploadedAt: "2026-08-15T00:00:00.000Z" },
    });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("舊名稱.pdf");

    fireEvent.click(screen.getAllByRole("button", { name: "重新命名" })[0]!);
    fireEvent.change(screen.getByLabelText("文件名稱"), { target: { value: "新名稱.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    expect(await screen.findByText("新名稱.pdf")).toBeInTheDocument();
    expect(screen.queryByText("舊名稱.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("不受影響.pdf")).toBeInTheDocument();
  });
});

describe("KnowledgeDocumentList — archive document action (E05-S025)", () => {
  it("shows the 作用中文件/已封存文件 view switch, defaulting to the active view pressed", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({ ok: true, value: [] });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("這個知識庫尚無文件。");

    expect(screen.getByRole("button", { name: "作用中文件" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "已封存文件" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls listKnowledgeBaseDocuments with the matching archived flag on mount and on each view switch", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({ ok: true, value: [] });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("這個知識庫尚無文件。");
    expect(mockedListKnowledgeBaseDocuments).toHaveBeenNthCalledWith(1, "kb1", false);

    fireEvent.click(screen.getByRole("button", { name: "已封存文件" }));
    await waitFor(() => expect(mockedListKnowledgeBaseDocuments).toHaveBeenNthCalledWith(2, "kb1", true));

    fireEvent.click(screen.getByRole("button", { name: "作用中文件" }));
    await waitFor(() => expect(mockedListKnowledgeBaseDocuments).toHaveBeenNthCalledWith(3, "kb1", false));
  });

  it("hides the upload/URL import/text input widgets while viewing archived documents", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({ ok: true, value: [] });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByLabelText("上傳文件");

    fireEvent.click(screen.getByRole("button", { name: "已封存文件" }));

    await waitFor(() => expect(screen.queryByLabelText("上傳文件")).not.toBeInTheDocument());
    expect(screen.queryByLabelText("從網址匯入")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("標題")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "作用中文件" }));
    expect(await screen.findByLabelText("上傳文件")).toBeInTheDocument();
  });

  it("shows a distinct 尚無已封存的文件 empty state when viewing archived with zero results", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({ ok: true, value: [] });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("這個知識庫尚無文件。");

    fireEvent.click(screen.getByRole("button", { name: "已封存文件" }));

    expect(await screen.findByText("尚無已封存的文件。")).toBeInTheDocument();
    expect(screen.queryByText("這個知識庫尚無文件。")).not.toBeInTheDocument();
  });

  it("shows a 封存文件 button for every document in the active view", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [
        { id: "doc1", knowledgeBaseId: "kb1", name: "第一份.pdf", sizeBytes: 100, uploadedAt: "2026-08-15T00:00:00.000Z" },
        { id: "doc2", knowledgeBaseId: "kb1", name: "第二份.pdf", sizeBytes: 200, uploadedAt: "2026-08-15T00:00:00.000Z" },
      ],
    });

    render(<KnowledgeDocumentList id="kb1" />);

    await screen.findByText("第一份.pdf");
    expect(screen.getAllByRole("button", { name: "封存文件" })).toHaveLength(2);
  });

  it("archiving a document removes it from the active view once the list refreshes, leaving the others", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments
      .mockResolvedValueOnce({
        ok: true,
        value: [
          { id: "doc1", knowledgeBaseId: "kb1", name: "要封存的.pdf", sizeBytes: 100, uploadedAt: "2026-08-15T00:00:00.000Z" },
          { id: "doc2", knowledgeBaseId: "kb1", name: "保留的.pdf", sizeBytes: 200, uploadedAt: "2026-08-15T00:00:00.000Z" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [{ id: "doc2", knowledgeBaseId: "kb1", name: "保留的.pdf", sizeBytes: 200, uploadedAt: "2026-08-15T00:00:00.000Z" }],
      });
    mockedArchiveKnowledgeBaseDocument.mockResolvedValue({
      ok: true,
      value: {
        id: "doc1",
        knowledgeBaseId: "kb1",
        name: "要封存的.pdf",
        sizeBytes: 100,
        archived: true,
        uploadedAt: "2026-08-15T00:00:00.000Z",
      },
    });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("要封存的.pdf");

    fireEvent.click(screen.getAllByRole("button", { name: "封存文件" })[0]!);

    await waitFor(() => expect(screen.queryByText("要封存的.pdf")).not.toBeInTheDocument());
    expect(screen.getByText("保留的.pdf")).toBeInTheDocument();
    expect(mockedArchiveKnowledgeBaseDocument).toHaveBeenCalledWith("kb1", "doc1");
    expect(mockedListKnowledgeBaseDocuments).toHaveBeenNthCalledWith(2, "kb1", false);
  });

  it("shows a 取消封存 button (not 封存文件) for documents shown in the archived view", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "doc1",
            knowledgeBaseId: "kb1",
            name: "已封存的.pdf",
            sizeBytes: 100,
            archived: true,
            uploadedAt: "2026-08-15T00:00:00.000Z",
          },
        ],
      });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("這個知識庫尚無文件。");

    fireEvent.click(screen.getByRole("button", { name: "已封存文件" }));

    expect(await screen.findByText("已封存的.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消封存" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "封存文件" })).not.toBeInTheDocument();
  });

  it("unarchiving a document removes it from the archived view once the list refreshes", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "doc1",
            knowledgeBaseId: "kb1",
            name: "已封存的.pdf",
            sizeBytes: 100,
            archived: true,
            uploadedAt: "2026-08-15T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, value: [] });
    mockedUnarchiveKnowledgeBaseDocument.mockResolvedValue({
      ok: true,
      value: {
        id: "doc1",
        knowledgeBaseId: "kb1",
        name: "已封存的.pdf",
        sizeBytes: 100,
        archived: false,
        uploadedAt: "2026-08-15T00:00:00.000Z",
      },
    });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("這個知識庫尚無文件。");

    fireEvent.click(screen.getByRole("button", { name: "已封存文件" }));
    await screen.findByText("已封存的.pdf");

    fireEvent.click(screen.getByRole("button", { name: "取消封存" }));

    expect(await screen.findByText("尚無已封存的文件。")).toBeInTheDocument();
    expect(mockedUnarchiveKnowledgeBaseDocument).toHaveBeenCalledWith("kb1", "doc1");
    expect(mockedListKnowledgeBaseDocuments).toHaveBeenNthCalledWith(3, "kb1", true);
  });

  it("a stale in-flight upload started before a view switch refreshes the CURRENTLY-viewed view on completion, not the view active when it started", async () => {
    // Regression test: KnowledgeDocumentUpload is hidden (unmounted) while
    // viewingArchived is true, but its own async upload sequence has no
    // unmount guard and still calls onUploaded when it finishes. Before
    // refetchDocuments' default read a ref, a slow upload started on the
    // active view that finished AFTER the user switched to the archived
    // view would silently overwrite the now-displayed archived list with
    // the active one, while the view-switch buttons still claimed 已封存文件
    // was selected.
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "existing-archived",
            knowledgeBaseId: "kb1",
            name: "既有已封存.pdf",
            sizeBytes: 50,
            archived: true,
            uploadedAt: "2026-08-15T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "existing-archived",
            knowledgeBaseId: "kb1",
            name: "既有已封存.pdf",
            sizeBytes: 50,
            archived: true,
            uploadedAt: "2026-08-15T00:00:00.000Z",
          },
        ],
      });
    let resolveAdd!: (value: Awaited<ReturnType<typeof addKnowledgeBaseDocument>>) => void;
    mockedAddKnowledgeBaseDocument.mockReturnValue(new Promise((resolve) => (resolveAdd = resolve)));

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("這個知識庫尚無文件。");

    const file = new File([new Uint8Array(100)], "上傳中的檔案.pdf");
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    // Switch views WHILE the upload's addKnowledgeBaseDocument call is
    // still pending — this unmounts KnowledgeDocumentUpload.
    fireEvent.click(screen.getByRole("button", { name: "已封存文件" }));
    await screen.findByText("既有已封存.pdf");
    expect(screen.queryByLabelText("上傳文件")).not.toBeInTheDocument();

    // Now let the stale, in-flight upload complete.
    resolveAdd({
      ok: true,
      value: { id: "new-doc", knowledgeBaseId: "kb1", name: "上傳中的檔案.pdf", sizeBytes: 100, uploadedAt: "2026-08-15T00:00:00.000Z" },
    });

    // The stale upload's own onUploaded fires and refetches — it must
    // reflect the CURRENTLY-viewed (archived) list, not silently
    // overwrite it with the active view the upload started under.
    await waitFor(() => expect(mockedListKnowledgeBaseDocuments).toHaveBeenCalledTimes(3));
    expect(mockedListKnowledgeBaseDocuments).toHaveBeenNthCalledWith(3, "kb1", true);
    expect(screen.getByText("既有已封存.pdf")).toBeInTheDocument();
    expect(screen.queryByText("上傳中的檔案.pdf")).not.toBeInTheDocument();
  });
});

describe("KnowledgeDocumentList — delete document confirmation (E05-S026)", () => {
  it("shows a 刪除文件 control for every document in the list", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [
        { id: "doc1", knowledgeBaseId: "kb1", name: "第一份.pdf", sizeBytes: 100, uploadedAt: "2026-08-15T00:00:00.000Z" },
        { id: "doc2", knowledgeBaseId: "kb1", name: "第二份.pdf", sizeBytes: 200, uploadedAt: "2026-08-15T00:00:00.000Z" },
      ],
    });

    render(<KnowledgeDocumentList id="kb1" />);

    await screen.findByText("第一份.pdf");
    expect(screen.getAllByRole("button", { name: "刪除文件" })).toHaveLength(2);
  });

  it("deleting a document (after confirming) removes it from the list, without disturbing the others", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments
      .mockResolvedValueOnce({
        ok: true,
        value: [
          { id: "doc1", knowledgeBaseId: "kb1", name: "要刪除的.pdf", sizeBytes: 100, uploadedAt: "2026-08-15T00:00:00.000Z" },
          { id: "doc2", knowledgeBaseId: "kb1", name: "保留的.pdf", sizeBytes: 200, uploadedAt: "2026-08-15T00:00:00.000Z" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [{ id: "doc2", knowledgeBaseId: "kb1", name: "保留的.pdf", sizeBytes: 200, uploadedAt: "2026-08-15T00:00:00.000Z" }],
      });
    mockedDeleteKnowledgeBaseDocument.mockResolvedValue({ ok: true, value: undefined });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("要刪除的.pdf");

    const targetItem = screen.getByText("要刪除的.pdf").closest("li")!;
    fireEvent.click(within(targetItem).getByRole("button", { name: "刪除文件" }));
    fireEvent.click(within(targetItem).getByRole("button", { name: "確認刪除" }));

    await waitFor(() => expect(screen.queryByText("要刪除的.pdf")).not.toBeInTheDocument());
    expect(screen.getByText("保留的.pdf")).toBeInTheDocument();
    expect(mockedDeleteKnowledgeBaseDocument).toHaveBeenCalledWith("kb1", "doc1");
  });

  it("clicking 取消 on the delete confirmation leaves the document in the list", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [{ id: "doc1", knowledgeBaseId: "kb1", name: "不刪除.pdf", sizeBytes: 100, uploadedAt: "2026-08-15T00:00:00.000Z" }],
    });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("不刪除.pdf");

    fireEvent.click(screen.getByRole("button", { name: "刪除文件" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.getByText("不刪除.pdf")).toBeInTheDocument();
    expect(mockedDeleteKnowledgeBaseDocument).not.toHaveBeenCalled();
  });

  it("deleting an archived document while viewing 已封存文件 refreshes that same view, not the active one", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "doc1",
            knowledgeBaseId: "kb1",
            name: "已封存待刪除.pdf",
            sizeBytes: 100,
            archived: true,
            uploadedAt: "2026-08-15T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, value: [] });
    mockedDeleteKnowledgeBaseDocument.mockResolvedValue({ ok: true, value: undefined });

    render(<KnowledgeDocumentList id="kb1" />);
    await screen.findByText("這個知識庫尚無文件。");

    fireEvent.click(screen.getByRole("button", { name: "已封存文件" }));
    await screen.findByText("已封存待刪除.pdf");

    fireEvent.click(screen.getByRole("button", { name: "刪除文件" }));
    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    await waitFor(() => expect(mockedListKnowledgeBaseDocuments).toHaveBeenNthCalledWith(3, "kb1", true));
    expect(await screen.findByText("尚無已封存的文件。")).toBeInTheDocument();
  });
});
