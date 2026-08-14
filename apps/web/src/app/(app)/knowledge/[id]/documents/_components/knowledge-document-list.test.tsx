import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgeDocumentList from "./knowledge-document-list";
import { getKnowledgeBase } from "@/lib/knowledge-bases";
import { addKnowledgeBaseDocument, listKnowledgeBaseDocuments } from "@/lib/knowledge-documents";

vi.mock("@/lib/knowledge-bases", () => ({
  getKnowledgeBase: vi.fn(),
}));

vi.mock("@/lib/knowledge-documents", () => ({
  listKnowledgeBaseDocuments: vi.fn(),
  addKnowledgeBaseDocument: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedGetKnowledgeBase = vi.mocked(getKnowledgeBase);
const mockedListKnowledgeBaseDocuments = vi.mocked(listKnowledgeBaseDocuments);
const mockedAddKnowledgeBaseDocument = vi.mocked(addKnowledgeBaseDocument);

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
});
