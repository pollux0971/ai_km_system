import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CitationSourceView } from "./citation-source-view";
import { getCitationSource } from "@/lib/citations";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/citations", () => ({
  getCitationSource: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedGetCitationSource = vi.mocked(getCitationSource);
const mockedTrackEvent = vi.mocked(trackEvent);

const MOCK_SOURCE_1 = { id: "1", file: "來源檔案 1", page: 1, snippet: "片段 1" };

beforeEach(() => {
  mockedGetCitationSource.mockReset();
  mockedTrackEvent.mockReset();
});

describe("CitationSourceView (E03-S015)", () => {
  it("shows a loading state before the lookup resolves", () => {
    mockedGetCitationSource.mockReturnValue(new Promise(() => {}));

    render(<CitationSourceView id="1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows File/Page and an explicit placeholder notice once loaded, distinct from the raw snippet", async () => {
    mockedGetCitationSource.mockResolvedValue({ ok: true, value: MOCK_SOURCE_1 });

    render(<CitationSourceView id="1" />);

    expect(await screen.findByText("來源檔案 1")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("片段 1")).toBeInTheDocument();
    expect(screen.getByText(/真正的文件內容檢視器依賴 Object Storage/)).toBeInTheDocument();
    expect(mockedGetCitationSource).toHaveBeenCalledWith("1");
  });

  it("shows a specific not-found message for an unknown citation id", async () => {
    mockedGetCitationSource.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "not found" } });

    render(<CitationSourceView id="missing" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到這個引用來源。");
  });

  it("falls back to the shared generic error message for a non-NOT_FOUND failure code", async () => {
    mockedGetCitationSource.mockResolvedValue({ ok: false, error: { code: "SERVER_ERROR", message: "boom" } });

    render(<CitationSourceView id="1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("系統發生錯誤，請稍後再試。");
  });

  it("fires attempt/success telemetry sharing one correlationId on a successful load", async () => {
    mockedGetCitationSource.mockResolvedValue({ ok: true, value: MOCK_SOURCE_1 });

    render(<CitationSourceView id="1" />);
    await screen.findByText("來源檔案 1");

    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_citation_open_source_attempt",
      expect.objectContaining({ properties: expect.objectContaining({ citationId: "1" }) }),
    );
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_citation_open_source_success",
      expect.objectContaining({ properties: expect.objectContaining({ citationId: "1" }) }),
    );
    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "conversation_citation_open_source_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "conversation_citation_open_source_success");
    expect(attemptCall?.[1]?.correlationId).toBe(successCall?.[1]?.correlationId);
  });

  it("fires failure telemetry (not success) when the lookup fails", async () => {
    mockedGetCitationSource.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "not found" } });

    render(<CitationSourceView id="missing" />);
    await screen.findByRole("alert");

    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_citation_open_source_failure",
      expect.objectContaining({ properties: expect.objectContaining({ citationId: "missing", code: "NOT_FOUND" }) }),
    );
    expect(mockedTrackEvent).not.toHaveBeenCalledWith("conversation_citation_open_source_success", expect.anything());
  });
});
