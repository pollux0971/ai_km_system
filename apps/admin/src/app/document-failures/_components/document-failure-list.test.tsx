import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DocumentFailureList from "./document-failure-list";
import { listFailedDocuments } from "@/lib/document-failures";

vi.mock("@/lib/document-failures", () => ({
  listFailedDocuments: vi.fn(),
}));

const mockedListFailedDocuments = vi.mocked(listFailedDocuments);

describe("DocumentFailureList (E11-S018)", () => {
  it("shows a loading indicator before the list resolves", () => {
    mockedListFailedDocuments.mockReturnValue(new Promise(() => {}));

    render(<DocumentFailureList />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedListFailedDocuments.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<DocumentFailureList />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows an empty state when there are no failed documents — the real production state today", async () => {
    mockedListFailedDocuments.mockResolvedValue({ ok: true, value: [] });

    render(<DocumentFailureList />);

    expect(await screen.findByText("尚無處理失敗的文件。")).toBeInTheDocument();
  });

  it("shows a failed document's own name, knowledge base id, and uploaded-at time once loaded", async () => {
    mockedListFailedDocuments.mockResolvedValue({
      ok: true,
      value: [{ id: "d1", knowledgeBaseId: "kb-1", name: "產品保固條款.pdf", sizeBytes: 245_000, uploadedAt: "2026-08-17T01:00:00.000Z" }],
    });

    render(<DocumentFailureList />);

    expect(await screen.findByText("產品保固條款.pdf")).toBeInTheDocument();
    expect(screen.getByText("kb-1")).toBeInTheDocument();
    expect(document.querySelector('time[datetime="2026-08-17T01:00:00.000Z"]')).toBeInTheDocument();
  });

  it("renders every item it's given, not just the first few — a silent truncation would slip past a small fixture", async () => {
    const names = ["文件 0.pdf", "文件 1.pdf", "文件 2.pdf", "文件 3.pdf", "文件 4.pdf"];
    mockedListFailedDocuments.mockResolvedValue({
      ok: true,
      value: names.map((name, index) => ({
        id: `d${index}`,
        knowledgeBaseId: "kb-1",
        name,
        uploadedAt: "2026-08-17T01:00:00.000Z",
      })),
    });

    render(<DocumentFailureList />);

    await screen.findByText("文件 0.pdf");
    for (const name of names) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("does not show the empty state once failed documents are loaded", async () => {
    mockedListFailedDocuments.mockResolvedValue({
      ok: true,
      value: [{ id: "d1", knowledgeBaseId: "kb-1", name: "產品保固條款.pdf", uploadedAt: "2026-08-17T01:00:00.000Z" }],
    });

    render(<DocumentFailureList />);

    await screen.findByText("產品保固條款.pdf");
    expect(screen.queryByText("尚無處理失敗的文件。")).not.toBeInTheDocument();
  });
});
