import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import KnowledgeDocumentPreview from "./knowledge-document-preview";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedTrackEvent = vi.mocked(trackEvent);

beforeEach(() => {
  mockedTrackEvent.mockReset();
});

describe("KnowledgeDocumentPreview (E05-S022)", () => {
  it("shows a 預覽 button and no content before it's clicked", () => {
    render(<KnowledgeDocumentPreview knowledgeBaseId="kb1" documentId="doc1" content="真實內容" />);

    expect(screen.getByRole("button", { name: "預覽" })).toBeInTheDocument();
    expect(screen.queryByText("真實內容")).not.toBeInTheDocument();
  });

  it("shows the real stored content, verbatim, when expanded", () => {
    render(<KnowledgeDocumentPreview knowledgeBaseId="kb1" documentId="doc1" content={"第一行\n第二行"} />);

    fireEvent.click(screen.getByRole("button", { name: "預覽" }));

    // A plain-string getByText normalizes whitespace (collapsing the
    // newline), which would defeat the point of this test — asserting
    // directly on the <pre> element's own textContent is what actually
    // proves the line break survives verbatim, matching the
    // white-space: pre-wrap styling.
    const pre = document.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toBe("第一行\n第二行");
  });

  it("shows an honest 無法預覽 message, not fake content, for a document with no stored content", () => {
    render(<KnowledgeDocumentPreview knowledgeBaseId="kb1" documentId="doc1" content={undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "預覽" }));

    expect(screen.getByText("此文件目前無法預覽。")).toBeInTheDocument();
  });

  it("toggles the button label and collapses the content again on a second click", () => {
    render(<KnowledgeDocumentPreview knowledgeBaseId="kb1" documentId="doc1" content="真實內容" />);

    fireEvent.click(screen.getByRole("button", { name: "預覽" }));
    expect(screen.getByText("真實內容")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收合預覽" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收合預覽" }));
    expect(screen.queryByText("真實內容")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "預覽" })).toBeInTheDocument();
  });

  it("reflects expanded state via aria-expanded", () => {
    render(<KnowledgeDocumentPreview knowledgeBaseId="kb1" documentId="doc1" content="真實內容" />);

    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("emits knowledge_base_document_preview_viewed on first expand, including hasContent but never the content itself", () => {
    render(<KnowledgeDocumentPreview knowledgeBaseId="kb1" documentId="doc1" content="機密專案內容" />);

    fireEvent.click(screen.getByRole("button", { name: "預覽" }));

    expect(mockedTrackEvent).toHaveBeenCalledWith("knowledge_base_document_preview_viewed", {
      properties: { knowledgeBaseId: "kb1", documentId: "doc1", hasContent: true },
    });
    for (const call of mockedTrackEvent.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("機密專案內容");
    }
  });

  it("emits hasContent:false for a document with no stored content", () => {
    render(<KnowledgeDocumentPreview knowledgeBaseId="kb1" documentId="doc1" content={undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "預覽" }));

    expect(mockedTrackEvent).toHaveBeenCalledWith("knowledge_base_document_preview_viewed", {
      properties: { knowledgeBaseId: "kb1", documentId: "doc1", hasContent: false },
    });
  });

  it("emits a fresh telemetry event on every expand, not just the first — re-expanding after collapsing is its own genuine view", () => {
    render(<KnowledgeDocumentPreview knowledgeBaseId="kb1" documentId="doc1" content="真實內容" />);

    fireEvent.click(screen.getByRole("button", { name: "預覽" }));
    fireEvent.click(screen.getByRole("button", { name: "收合預覽" }));
    fireEvent.click(screen.getByRole("button", { name: "預覽" }));

    const viewedCalls = mockedTrackEvent.mock.calls.filter((call) => call[0] === "knowledge_base_document_preview_viewed");
    expect(viewedCalls).toHaveLength(2);
  });

  it("does not emit any telemetry event when collapsing (only on expand)", () => {
    render(<KnowledgeDocumentPreview knowledgeBaseId="kb1" documentId="doc1" content="真實內容" />);

    fireEvent.click(screen.getByRole("button", { name: "預覽" }));
    mockedTrackEvent.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "收合預覽" }));

    expect(mockedTrackEvent).not.toHaveBeenCalled();
  });
});
