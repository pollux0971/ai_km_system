import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CitationPreviewDrawer } from "./citation-preview-drawer";
import { getCitationSource } from "@/lib/citations";
import { trackEvent } from "@/lib/telemetry";

// citation-preview-drawer.tsx reads CITATION_ERROR_MESSAGES (a plain
// object, not a function) directly from this module — the mock factory
// has to provide it too, or rendering an "error" state crashes with
// "No CITATION_ERROR_MESSAGES export is defined on the mock". Values
// duplicated (not vi.importActual'd) to keep this a plain synchronous
// factory, matching this file's existing @/lib/telemetry mock.
vi.mock("@/lib/citations", () => ({
  getCitationSource: vi.fn(),
  CITATION_ERROR_MESSAGES: {
    NOT_FOUND: "找不到這個引用來源。",
    FORBIDDEN: "您沒有權限檢視這個引用來源。",
  },
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedGetCitationSource = vi.mocked(getCitationSource);
const mockedTrackEvent = vi.mocked(trackEvent);

const MOCK_SOURCE_1 = { id: "1", file: "來源檔案 1", page: 1, snippet: "片段 1" };
const MOCK_SOURCE_2 = { id: "2", file: "來源檔案 2", page: 5, snippet: "片段 2" };

beforeEach(() => {
  mockedGetCitationSource.mockReset();
  mockedTrackEvent.mockReset();
});

describe("CitationPreviewDrawer (E03-S014)", () => {
  it("renders nothing when citationId is null", () => {
    const { container } = render(<CitationPreviewDrawer citationId={null} onClose={() => {}} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows a loading state before the lookup resolves", () => {
    mockedGetCitationSource.mockReturnValue(new Promise(() => {}));

    render(<CitationPreviewDrawer citationId="1" onClose={() => {}} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows File/Page/Snippet once the lookup resolves", async () => {
    mockedGetCitationSource.mockResolvedValue({ ok: true, value: MOCK_SOURCE_1 });

    render(<CitationPreviewDrawer citationId="1" onClose={() => {}} />);

    expect(await screen.findByText("來源檔案 1")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("片段 1")).toBeInTheDocument();
    expect(mockedGetCitationSource).toHaveBeenCalledWith("1");
  });

  it("shows a specific not-found message when the citation id doesn't resolve to a source", async () => {
    mockedGetCitationSource.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "not found" } });

    render(<CitationPreviewDrawer citationId="missing" onClose={() => {}} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到這個引用來源。");
  });

  it("falls back to the shared generic error message for a non-NOT_FOUND failure code", async () => {
    mockedGetCitationSource.mockResolvedValue({ ok: false, error: { code: "SERVER_ERROR", message: "boom" } });

    render(<CitationPreviewDrawer citationId="1" onClose={() => {}} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("系統發生錯誤，請稍後再試。");
  });

  it("calls onClose when the close button is clicked", async () => {
    mockedGetCitationSource.mockResolvedValue({ ok: true, value: MOCK_SOURCE_1 });
    const onClose = vi.fn();

    render(<CitationPreviewDrawer citationId="1" onClose={onClose} />);
    await screen.findByText("來源檔案 1");
    screen.getByRole("button", { name: "關閉" }).click();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reloads with new content when citationId switches to a different citation", async () => {
    mockedGetCitationSource.mockImplementation((id) =>
      Promise.resolve({ ok: true, value: id === "1" ? MOCK_SOURCE_1 : MOCK_SOURCE_2 }),
    );

    const { rerender } = render(<CitationPreviewDrawer citationId="1" onClose={() => {}} />);
    await screen.findByText("來源檔案 1");

    rerender(<CitationPreviewDrawer citationId="2" onClose={() => {}} />);

    expect(await screen.findByText("來源檔案 2")).toBeInTheDocument();
    expect(screen.queryByText("來源檔案 1")).not.toBeInTheDocument();
  });

  it("fires attempt/success telemetry sharing one correlationId on a successful lookup", async () => {
    mockedGetCitationSource.mockResolvedValue({ ok: true, value: MOCK_SOURCE_1 });

    render(<CitationPreviewDrawer citationId="1" onClose={() => {}} />);
    await screen.findByText("來源檔案 1");

    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_citation_preview_attempt",
      expect.objectContaining({ properties: expect.objectContaining({ citationId: "1" }) }),
    );
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_citation_preview_success",
      expect.objectContaining({ properties: expect.objectContaining({ citationId: "1" }) }),
    );
    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "conversation_citation_preview_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "conversation_citation_preview_success");
    expect(attemptCall?.[1]?.correlationId).toBe(successCall?.[1]?.correlationId);
  });

  it("fires failure telemetry (not success) when the lookup fails", async () => {
    mockedGetCitationSource.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "not found" } });

    render(<CitationPreviewDrawer citationId="missing" onClose={() => {}} />);
    await screen.findByRole("alert");

    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_citation_preview_failure",
      expect.objectContaining({ properties: expect.objectContaining({ citationId: "missing", code: "NOT_FOUND" }) }),
    );
    expect(mockedTrackEvent).not.toHaveBeenCalledWith("conversation_citation_preview_success", expect.anything());
  });
});

describe("CitationPreviewDrawer open-source link (E03-S015)", () => {
  it("shows an 'open source' link pointing at /citations/{id} once loaded", async () => {
    mockedGetCitationSource.mockResolvedValue({ ok: true, value: MOCK_SOURCE_1 });

    render(<CitationPreviewDrawer citationId="1" onClose={() => {}} />);
    await screen.findByText("來源檔案 1");

    expect(screen.getByRole("link", { name: "開啟原始來源" })).toHaveAttribute("href", "/citations/1");
  });

  it("does not show the open-source link while loading or on error", async () => {
    mockedGetCitationSource.mockReturnValue(new Promise(() => {}));
    const { rerender } = render(<CitationPreviewDrawer citationId="1" onClose={() => {}} />);
    expect(screen.queryByRole("link", { name: "開啟原始來源" })).not.toBeInTheDocument();

    mockedGetCitationSource.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "not found" } });
    rerender(<CitationPreviewDrawer citationId="missing" onClose={() => {}} />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("link", { name: "開啟原始來源" })).not.toBeInTheDocument();
  });
});

describe("CitationPreviewDrawer permission-denied handling (E03-S016)", () => {
  it("shows a specific permission-denied message for a FORBIDDEN citation", async () => {
    mockedGetCitationSource.mockResolvedValue({ ok: false, error: { code: "FORBIDDEN", message: "forbidden" } });

    render(<CitationPreviewDrawer citationId="3" onClose={() => {}} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("您沒有權限檢視這個引用來源。");
  });

  // Security-negative (deny-wins): the AC this proves is "unauthorized
  // source content must never enter the UI" — not just "an error message
  // is shown alongside hidden content", but that File/Page/Snippet never
  // render into the DOM at all for a FORBIDDEN result.
  it("never renders File/Page/Snippet content for a FORBIDDEN citation", async () => {
    mockedGetCitationSource.mockResolvedValue({ ok: false, error: { code: "FORBIDDEN", message: "forbidden" } });

    render(<CitationPreviewDrawer citationId="3" onClose={() => {}} />);
    await screen.findByRole("alert");

    expect(screen.queryByText("檔案", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("頁碼", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("片段", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "開啟原始來源" })).not.toBeInTheDocument();
  });

  it("fires failure telemetry with code FORBIDDEN (not success) when the citation is permission-denied", async () => {
    mockedGetCitationSource.mockResolvedValue({ ok: false, error: { code: "FORBIDDEN", message: "forbidden" } });

    render(<CitationPreviewDrawer citationId="3" onClose={() => {}} />);
    await screen.findByRole("alert");

    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_citation_preview_failure",
      expect.objectContaining({ properties: expect.objectContaining({ citationId: "3", code: "FORBIDDEN" }) }),
    );
    expect(mockedTrackEvent).not.toHaveBeenCalledWith("conversation_citation_preview_success", expect.anything());
  });
});
