import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgeDocumentUpload from "./knowledge-document-upload";
import { addKnowledgeBaseDocument } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/knowledge-documents", () => ({
  addKnowledgeBaseDocument: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedAddKnowledgeBaseDocument = vi.mocked(addKnowledgeBaseDocument);
const mockedTrackEvent = vi.mocked(trackEvent);

function sampleFile(name = "保固條款.pdf", byteLength = 500) {
  return new File([new Uint8Array(byteLength)], name, { type: "application/pdf" });
}

beforeEach(() => {
  mockedAddKnowledgeBaseDocument.mockReset();
  mockedTrackEvent.mockReset();
});

describe("KnowledgeDocumentUpload (E05-S011)", () => {
  it("does not show a 上傳 button before any file is selected", () => {
    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "上傳" })).not.toBeInTheDocument();
  });

  it("shows the selected file's name and formatted size, plus a 上傳 button, once a file is picked", () => {
    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile("保固條款.pdf", 500)] } });

    expect(screen.getByText(/保固條款\.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/500 B/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上傳" })).toBeInTheDocument();
  });

  it("uploads the selected file's name and size, and clears the selection and notifies the parent on success", async () => {
    mockedAddKnowledgeBaseDocument.mockResolvedValue({
      ok: true,
      value: { id: "doc1", knowledgeBaseId: "kb1", name: "保固條款.pdf", sizeBytes: 500, uploadedAt: "2026-08-15T00:00:00.000Z" },
    });
    const onUploaded = vi.fn();

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={onUploaded} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile("保固條款.pdf", 500)] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(mockedAddKnowledgeBaseDocument).toHaveBeenCalledWith("kb1", "保固條款.pdf", 500);
    expect(screen.queryByRole("button", { name: "上傳" })).not.toBeInTheDocument();
  });

  it("shows a distinct error alert and keeps the file selected (not cleared) when the upload fails", async () => {
    mockedAddKnowledgeBaseDocument.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });
    const onUploaded = vi.fn();

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={onUploaded} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile("保固條款.pdf", 500)] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("上傳文件失敗，請稍後再試。");
    expect(screen.getByRole("button", { name: "上傳" })).toBeInTheDocument();
    expect(screen.getByText(/保固條款\.pdf/)).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("disables the input and 上傳 button while an upload is in flight, preventing a double submit", async () => {
    let resolveUpload!: (result: Awaited<ReturnType<typeof addKnowledgeBaseDocument>>) => void;
    mockedAddKnowledgeBaseDocument.mockReturnValueOnce(new Promise((resolve) => (resolveUpload = resolve)));

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "上傳" })).toBeDisabled());
    expect(screen.getByLabelText("上傳文件")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    resolveUpload({ ok: true, value: { id: "doc1", knowledgeBaseId: "kb1", name: "a.pdf", sizeBytes: 500, uploadedAt: "2026-08-15T00:00:00.000Z" } });
    await waitFor(() => expect(mockedAddKnowledgeBaseDocument).toHaveBeenCalledTimes(1));
  });

  it("replaces the preview when a different file is selected before uploading", () => {
    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile("第一份.pdf", 100)] } });
    expect(screen.getByText(/第一份\.pdf/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile("第二份.pdf", 200)] } });
    expect(screen.getByText(/第二份\.pdf/)).toBeInTheDocument();
    expect(screen.queryByText(/第一份\.pdf/)).not.toBeInTheDocument();
  });

  it("emits attempt and success telemetry sharing the same correlation id, including sizeBytes but NEVER the file name", async () => {
    mockedAddKnowledgeBaseDocument.mockResolvedValue({
      ok: true,
      value: { id: "doc1", knowledgeBaseId: "kb1", name: "機密專案報告.pdf", sizeBytes: 500, uploadedAt: "2026-08-15T00:00:00.000Z" },
    });

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile("機密專案報告.pdf", 500)] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(mockedAddKnowledgeBaseDocument).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_upload_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_upload_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attempt = attemptCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    const success = successCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    expect(attempt[1].correlationId).toBe(success[1].correlationId);
    expect(attempt[1].properties).toMatchObject({ knowledgeBaseId: "kb1", sizeBytes: 500 });
    // The whole point of this test: no call anywhere included the actual file name.
    for (const call of mockedTrackEvent.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("機密專案報告");
    }
  });

  it("emits failure telemetry with the error code when the upload fails", async () => {
    mockedAddKnowledgeBaseDocument.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_upload_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("SERVICE_UNAVAILABLE");
  });
});
