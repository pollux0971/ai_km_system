import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewErpQueryPage from "./page";
import { submitErpQuery } from "@/lib/erp-queries";
import { trackEvent } from "@/lib/telemetry";

const { mockReplace, mockRefresh, mockRouter } = vi.hoisted(() => {
  const mockReplace = vi.fn();
  const mockRefresh = vi.fn();
  return { mockReplace, mockRefresh, mockRouter: { replace: mockReplace, refresh: mockRefresh } };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("@/lib/erp-queries", () => ({
  submitErpQuery: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedSubmitErpQuery = vi.mocked(submitErpQuery);
const mockedTrackEvent = vi.mocked(trackEvent);

const sampleQuery = {
  id: "erp-query-new-1",
  questionText: "上季各產品線的毛利率是多少?",
  createdAt: "2026-08-16T00:00:00.000Z",
};

beforeEach(() => {
  mockReplace.mockReset();
  mockRefresh.mockReset();
  mockedSubmitErpQuery.mockReset();
  mockedTrackEvent.mockReset();
});

describe("NewErpQueryPage (E09-S002)", () => {
  it("renders the question textarea with the submit button disabled until text is entered", () => {
    render(<NewErpQueryPage />);

    expect(screen.getByLabelText("輸入您的問題")).toHaveValue("");
    expect(screen.getByRole("button", { name: "送出查詢" })).toBeDisabled();
  });

  it("enables the submit button once non-whitespace text is typed", () => {
    render(<NewErpQueryPage />);

    fireEvent.change(screen.getByLabelText("輸入您的問題"), { target: { value: "上個月營收多少?" } });

    expect(screen.getByRole("button", { name: "送出查詢" })).toBeEnabled();
  });

  it("keeps the submit button disabled for whitespace-only text", () => {
    render(<NewErpQueryPage />);

    fireEvent.change(screen.getByLabelText("輸入您的問題"), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "送出查詢" })).toBeDisabled();
  });

  it("the cancel link points back to /erp", () => {
    render(<NewErpQueryPage />);

    expect(screen.getByRole("link", { name: "取消" })).toHaveAttribute("href", "/erp");
  });

  it("submits the typed question, then redirects to the new query's own page and refreshes the router cache", async () => {
    mockedSubmitErpQuery.mockResolvedValue({ ok: true, value: sampleQuery });

    render(<NewErpQueryPage />);
    fireEvent.change(screen.getByLabelText("輸入您的問題"), { target: { value: sampleQuery.questionText } });
    fireEvent.click(screen.getByRole("button", { name: "送出查詢" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(`/erp/${sampleQuery.id}`));
    expect(mockedSubmitErpQuery).toHaveBeenCalledWith(sampleQuery.questionText);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows a distinct error alert when submission fails, does not navigate away, and keeps the typed text", async () => {
    mockedSubmitErpQuery.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<NewErpQueryPage />);
    fireEvent.change(screen.getByLabelText("輸入您的問題"), { target: { value: sampleQuery.questionText } });
    fireEvent.click(screen.getByRole("button", { name: "送出查詢" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("無法送出查詢");
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("輸入您的問題")).toHaveValue(sampleQuery.questionText);
  });

  it("disables the submit button while the request is pending, preventing a double submit", async () => {
    let resolveSubmit!: (result: Awaited<ReturnType<typeof submitErpQuery>>) => void;
    mockedSubmitErpQuery.mockReturnValueOnce(new Promise((resolve) => (resolveSubmit = resolve)));

    render(<NewErpQueryPage />);
    fireEvent.change(screen.getByLabelText("輸入您的問題"), { target: { value: sampleQuery.questionText } });
    fireEvent.click(screen.getByRole("button", { name: "送出查詢" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "送出查詢" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "送出查詢" }));

    resolveSubmit({ ok: true, value: sampleQuery });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    expect(mockedSubmitErpQuery).toHaveBeenCalledTimes(1);
  });

  it("emits attempt and success telemetry sharing the same correlation id, excluding the question text itself", async () => {
    mockedSubmitErpQuery.mockResolvedValue({ ok: true, value: sampleQuery });

    render(<NewErpQueryPage />);
    fireEvent.change(screen.getByLabelText("輸入您的問題"), { target: { value: sampleQuery.questionText } });
    fireEvent.click(screen.getByRole("button", { name: "送出查詢" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "erp_query_create_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "erp_query_create_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attemptId = (attemptCall as [string, { correlationId: string }])[1].correlationId;
    const successId = (successCall as [string, { correlationId: string }])[1].correlationId;
    expect(attemptId).toBe(successId);

    for (const call of mockedTrackEvent.mock.calls) {
      const properties = (call as [string, { properties?: Record<string, unknown> }])[1]?.properties;
      expect(JSON.stringify(properties ?? {})).not.toContain(sampleQuery.questionText);
    }
  });

  it("emits failure telemetry with the error code when submission fails", async () => {
    mockedSubmitErpQuery.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<NewErpQueryPage />);
    fireEvent.change(screen.getByLabelText("輸入您的問題"), { target: { value: sampleQuery.questionText } });
    fireEvent.click(screen.getByRole("button", { name: "送出查詢" }));

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "erp_query_create_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("SERVICE_UNAVAILABLE");
  });
});
