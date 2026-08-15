import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgeDocumentArchiveToggle from "./knowledge-document-archive-toggle";
import { archiveKnowledgeBaseDocument, unarchiveKnowledgeBaseDocument } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/knowledge-documents", () => ({
  archiveKnowledgeBaseDocument: vi.fn(),
  unarchiveKnowledgeBaseDocument: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedArchive = vi.mocked(archiveKnowledgeBaseDocument);
const mockedUnarchive = vi.mocked(unarchiveKnowledgeBaseDocument);
const mockedTrackEvent = vi.mocked(trackEvent);

function sampleDocument(overrides: Partial<{ id: string; knowledgeBaseId: string; name: string; archived: boolean }> = {}) {
  return {
    id: "doc1",
    knowledgeBaseId: "kb1",
    name: "文件.pdf",
    sizeBytes: 500,
    uploadedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockedArchive.mockReset();
  mockedUnarchive.mockReset();
  mockedTrackEvent.mockReset();
});

describe("KnowledgeDocumentArchiveToggle (E05-S025)", () => {
  it("shows 封存文件 when archived is false", () => {
    render(<KnowledgeDocumentArchiveToggle knowledgeBaseId="kb1" documentId="doc1" archived={false} onToggled={vi.fn()} />);

    expect(screen.getByRole("button", { name: "封存文件" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取消封存" })).not.toBeInTheDocument();
  });

  it("shows 取消封存 when archived is true", () => {
    render(<KnowledgeDocumentArchiveToggle knowledgeBaseId="kb1" documentId="doc1" archived={true} onToggled={vi.fn()} />);

    expect(screen.getByRole("button", { name: "取消封存" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "封存文件" })).not.toBeInTheDocument();
  });

  it("clicking 封存文件 calls archiveKnowledgeBaseDocument (not unarchive) and calls onToggled on success", async () => {
    mockedArchive.mockResolvedValue({ ok: true, value: sampleDocument({ archived: true }) });
    const onToggled = vi.fn();
    render(<KnowledgeDocumentArchiveToggle knowledgeBaseId="kb1" documentId="doc1" archived={false} onToggled={onToggled} />);

    fireEvent.click(screen.getByRole("button", { name: "封存文件" }));

    await waitFor(() => expect(mockedArchive).toHaveBeenCalledWith("kb1", "doc1"));
    expect(mockedUnarchive).not.toHaveBeenCalled();
    await waitFor(() => expect(onToggled).toHaveBeenCalledTimes(1));
  });

  it("clicking 取消封存 calls unarchiveKnowledgeBaseDocument (not archive) and calls onToggled on success", async () => {
    mockedUnarchive.mockResolvedValue({ ok: true, value: sampleDocument({ archived: false }) });
    const onToggled = vi.fn();
    render(<KnowledgeDocumentArchiveToggle knowledgeBaseId="kb1" documentId="doc1" archived={true} onToggled={onToggled} />);

    fireEvent.click(screen.getByRole("button", { name: "取消封存" }));

    await waitFor(() => expect(mockedUnarchive).toHaveBeenCalledWith("kb1", "doc1"));
    expect(mockedArchive).not.toHaveBeenCalled();
    await waitFor(() => expect(onToggled).toHaveBeenCalledTimes(1));
  });

  it("shows a distinct error message, keeps the 封存文件 label, and does not call onToggled when archiving fails", async () => {
    mockedArchive.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } });
    const onToggled = vi.fn();
    render(<KnowledgeDocumentArchiveToggle knowledgeBaseId="kb1" documentId="doc1" archived={false} onToggled={onToggled} />);

    fireEvent.click(screen.getByRole("button", { name: "封存文件" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("封存失敗，請稍後再試。");
    expect(screen.getByRole("button", { name: "封存文件" })).toBeInTheDocument();
    expect(onToggled).not.toHaveBeenCalled();
  });

  it("shows a distinct error message and keeps the 取消封存 label when unarchiving fails", async () => {
    mockedUnarchive.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } });
    render(<KnowledgeDocumentArchiveToggle knowledgeBaseId="kb1" documentId="doc1" archived={true} onToggled={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "取消封存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("取消封存失敗，請稍後再試。");
    expect(screen.getByRole("button", { name: "取消封存" })).toBeInTheDocument();
  });

  it("disables the button while the toggle is in flight, preventing a double click", async () => {
    let resolveArchive!: (value: Awaited<ReturnType<typeof archiveKnowledgeBaseDocument>>) => void;
    mockedArchive.mockReturnValue(new Promise((resolve) => (resolveArchive = resolve)));
    render(<KnowledgeDocumentArchiveToggle knowledgeBaseId="kb1" documentId="doc1" archived={false} onToggled={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "封存文件" }));
    expect(screen.getByRole("button", { name: "封存文件" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "封存文件" }));

    resolveArchive({ ok: true, value: sampleDocument({ archived: true }) });
    await waitFor(() => expect(mockedArchive).toHaveBeenCalledTimes(1));
  });

  it("emits attempt and success telemetry sharing the same correlation id, including documentId but never the name", async () => {
    mockedArchive.mockResolvedValue({ ok: true, value: sampleDocument({ name: "機密專案文件.pdf", archived: true }) });
    render(<KnowledgeDocumentArchiveToggle knowledgeBaseId="kb1" documentId="doc1" archived={false} onToggled={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "封存文件" }));
    await waitFor(() => expect(mockedArchive).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_archive_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_archive_success");
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

  it("emits unarchive telemetry (not archive) when toggling from archived", async () => {
    mockedUnarchive.mockResolvedValue({ ok: true, value: sampleDocument({ archived: false }) });
    render(<KnowledgeDocumentArchiveToggle knowledgeBaseId="kb1" documentId="doc1" archived={true} onToggled={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "取消封存" }));
    await waitFor(() => expect(mockedUnarchive).toHaveBeenCalled());

    expect(mockedTrackEvent.mock.calls.some((call) => call[0] === "knowledge_base_document_unarchive_attempt")).toBe(true);
    expect(mockedTrackEvent.mock.calls.some((call) => call[0] === "knowledge_base_document_unarchive_success")).toBe(true);
    expect(mockedTrackEvent.mock.calls.some((call) => call[0] === "knowledge_base_document_archive_attempt")).toBe(false);
  });

  it("emits failure telemetry with the error code when the toggle fails", async () => {
    mockedArchive.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "down" } });
    render(<KnowledgeDocumentArchiveToggle knowledgeBaseId="kb1" documentId="doc1" archived={false} onToggled={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "封存文件" }));
    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_archive_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("NOT_FOUND");
  });
});
