import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgeDocumentList from "./knowledge-document-list";
import { getKnowledgeBase } from "@/lib/knowledge-bases";
import {
  addKnowledgeBaseDocument,
  addKnowledgeBaseDocumentFromText,
  addKnowledgeBaseDocumentFromUrl,
  listKnowledgeBaseDocuments,
  retryDocumentProcessing,
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

    expect(mockedListKnowledgeBaseDocuments).toHaveBeenCalledWith("kb-sample-2");
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
