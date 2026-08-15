import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgeDocumentNameEditor from "./knowledge-document-name-editor";
import { renameKnowledgeBaseDocument } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/knowledge-documents", () => ({
  renameKnowledgeBaseDocument: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedRenameKnowledgeBaseDocument = vi.mocked(renameKnowledgeBaseDocument);
const mockedTrackEvent = vi.mocked(trackEvent);

function sampleDocument(overrides: Partial<{ id: string; knowledgeBaseId: string; name: string; sizeBytes: number; uploadedAt: string }> = {}) {
  return {
    id: "doc1",
    knowledgeBaseId: "kb1",
    name: "新名稱.pdf",
    sizeBytes: 500,
    uploadedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockedRenameKnowledgeBaseDocument.mockReset();
  mockedTrackEvent.mockReset();
});

describe("KnowledgeDocumentNameEditor (E05-S023)", () => {
  it("shows the initial name with a 重新命名 button", () => {
    render(<KnowledgeDocumentNameEditor knowledgeBaseId="kb1" documentId="doc1" initialName="原始名稱.pdf" />);

    expect(screen.getByText("原始名稱.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新命名" })).toBeInTheDocument();
  });

  it("clicking 重新命名 shows an editable input pre-filled with the current name", () => {
    render(<KnowledgeDocumentNameEditor knowledgeBaseId="kb1" documentId="doc1" initialName="原始名稱.pdf" />);

    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));

    expect(screen.getByLabelText("文件名稱")).toHaveValue("原始名稱.pdf");
  });

  it("儲存 is disabled when the draft is empty or whitespace-only", () => {
    render(<KnowledgeDocumentNameEditor knowledgeBaseId="kb1" documentId="doc1" initialName="原始名稱.pdf" />);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));

    const input = screen.getByLabelText("文件名稱");
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByRole("button", { name: "儲存" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "儲存" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "新名稱.pdf" } });
    expect(screen.getByRole("button", { name: "儲存" })).not.toBeDisabled();
  });

  it("submitting a valid new name calls renameKnowledgeBaseDocument with the trimmed value, then shows the updated name", async () => {
    mockedRenameKnowledgeBaseDocument.mockResolvedValue({ ok: true, value: sampleDocument({ name: "新名稱.pdf" }) });
    render(<KnowledgeDocumentNameEditor knowledgeBaseId="kb1" documentId="doc1" initialName="原始名稱.pdf" />);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));

    fireEvent.change(screen.getByLabelText("文件名稱"), { target: { value: "  新名稱.pdf  " } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(mockedRenameKnowledgeBaseDocument).toHaveBeenCalledWith("kb1", "doc1", "新名稱.pdf"));
    expect(await screen.findByText("新名稱.pdf")).toBeInTheDocument();
    expect(screen.queryByLabelText("文件名稱")).not.toBeInTheDocument();
  });

  it("displays the SERVER's returned name on success, not just an echo of the locally-typed draft", async () => {
    mockedRenameKnowledgeBaseDocument.mockResolvedValue({ ok: true, value: sampleDocument({ name: "伺服器調整後的名稱.pdf" }) });
    render(<KnowledgeDocumentNameEditor knowledgeBaseId="kb1" documentId="doc1" initialName="原始名稱.pdf" />);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));

    fireEvent.change(screen.getByLabelText("文件名稱"), { target: { value: "使用者輸入的名稱.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    expect(await screen.findByText("伺服器調整後的名稱.pdf")).toBeInTheDocument();
    expect(screen.queryByText("使用者輸入的名稱.pdf")).not.toBeInTheDocument();
  });

  it("取消 reverts to the original name without calling renameKnowledgeBaseDocument", () => {
    render(<KnowledgeDocumentNameEditor knowledgeBaseId="kb1" documentId="doc1" initialName="原始名稱.pdf" />);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));

    fireEvent.change(screen.getByLabelText("文件名稱"), { target: { value: "還沒送出的草稿.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.getByText("原始名稱.pdf")).toBeInTheDocument();
    expect(screen.queryByLabelText("文件名稱")).not.toBeInTheDocument();
    expect(mockedRenameKnowledgeBaseDocument).not.toHaveBeenCalled();
  });

  it("re-opening the edit form after cancelling starts from the current (not the discarded draft) name", () => {
    render(<KnowledgeDocumentNameEditor knowledgeBaseId="kb1" documentId="doc1" initialName="原始名稱.pdf" />);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));
    fireEvent.change(screen.getByLabelText("文件名稱"), { target: { value: "還沒送出的草稿.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));

    expect(screen.getByLabelText("文件名稱")).toHaveValue("原始名稱.pdf");
  });

  it("shows a generic error message and stays in edit mode when the rename fails", async () => {
    mockedRenameKnowledgeBaseDocument.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } });
    render(<KnowledgeDocumentNameEditor knowledgeBaseId="kb1" documentId="doc1" initialName="原始名稱.pdf" />);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));

    fireEvent.change(screen.getByLabelText("文件名稱"), { target: { value: "新名稱.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("重新命名失敗，請稍後再試。");
    expect(screen.getByLabelText("文件名稱")).toBeInTheDocument();
    expect(screen.queryByText("新名稱.pdf")).not.toBeInTheDocument();
  });

  it("disables the input and buttons while the rename is in flight", async () => {
    let resolveRename!: (value: Awaited<ReturnType<typeof renameKnowledgeBaseDocument>>) => void;
    mockedRenameKnowledgeBaseDocument.mockReturnValue(new Promise((resolve) => (resolveRename = resolve)));
    render(<KnowledgeDocumentNameEditor knowledgeBaseId="kb1" documentId="doc1" initialName="原始名稱.pdf" />);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));
    fireEvent.change(screen.getByLabelText("文件名稱"), { target: { value: "新名稱.pdf" } });

    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    expect(screen.getByLabelText("文件名稱")).toBeDisabled();
    expect(screen.getByRole("button", { name: "儲存" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();

    resolveRename({ ok: true, value: sampleDocument() });
    await waitFor(() => expect(screen.queryByLabelText("文件名稱")).not.toBeInTheDocument());
  });

  it("emits attempt and success telemetry sharing the same correlation id, including documentId but never the name itself", async () => {
    mockedRenameKnowledgeBaseDocument.mockResolvedValue({ ok: true, value: sampleDocument({ name: "機密專案文件.pdf" }) });
    render(<KnowledgeDocumentNameEditor knowledgeBaseId="kb1" documentId="doc1" initialName="原始名稱.pdf" />);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));
    fireEvent.change(screen.getByLabelText("文件名稱"), { target: { value: "機密專案文件.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(mockedRenameKnowledgeBaseDocument).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_rename_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_rename_success");
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

  it("emits failure telemetry with the error code when the rename fails", async () => {
    mockedRenameKnowledgeBaseDocument.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "down" } });
    render(<KnowledgeDocumentNameEditor knowledgeBaseId="kb1" documentId="doc1" initialName="原始名稱.pdf" />);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));
    fireEvent.change(screen.getByLabelText("文件名稱"), { target: { value: "新名稱.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_rename_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("NOT_FOUND");
  });
});
