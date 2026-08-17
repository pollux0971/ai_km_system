import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DocumentFailureRetryButton from "./document-failure-retry-button";
import { retryDocumentProcessing } from "@/lib/document-failures";

vi.mock("@/lib/document-failures", () => ({
  retryDocumentProcessing: vi.fn(),
}));

const mockedRetry = vi.mocked(retryDocumentProcessing);

beforeEach(() => {
  mockedRetry.mockReset();
});

describe("DocumentFailureRetryButton (E11-S019)", () => {
  it("shows a 重試 button", () => {
    render(<DocumentFailureRetryButton documentId="d1" onRetried={vi.fn()} />);

    expect(screen.getByRole("button", { name: "重試" })).toBeInTheDocument();
  });

  it("clicking 重試 calls retryDocumentProcessing with the given documentId and calls onRetried on success", async () => {
    mockedRetry.mockResolvedValue({ ok: true, value: undefined });
    const onRetried = vi.fn();
    render(<DocumentFailureRetryButton documentId="d1" onRetried={onRetried} />);

    fireEvent.click(screen.getByRole("button", { name: "重試" }));

    await waitFor(() => expect(mockedRetry).toHaveBeenCalledWith("d1"));
    await waitFor(() => expect(onRetried).toHaveBeenCalledTimes(1));
  });

  it("shows an error message and does not call onRetried when the retry fails", async () => {
    mockedRetry.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } });
    const onRetried = vi.fn();
    render(<DocumentFailureRetryButton documentId="d1" onRetried={onRetried} />);

    fireEvent.click(screen.getByRole("button", { name: "重試" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到這份文件。");
    expect(onRetried).not.toHaveBeenCalled();
  });

  it("clears the previous error message once a retry succeeds", async () => {
    mockedRetry.mockResolvedValueOnce({ ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } });
    const onRetried = vi.fn();
    render(<DocumentFailureRetryButton documentId="d1" onRetried={onRetried} />);

    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("找不到這份文件。");

    mockedRetry.mockResolvedValueOnce({ ok: true, value: undefined });
    fireEvent.click(screen.getByRole("button", { name: "重試" }));

    await waitFor(() => expect(onRetried).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables the button while the retry is in flight, preventing a double click", async () => {
    let resolveRetry!: (value: Awaited<ReturnType<typeof retryDocumentProcessing>>) => void;
    mockedRetry.mockReturnValue(new Promise((resolve) => (resolveRetry = resolve)));
    render(<DocumentFailureRetryButton documentId="d1" onRetried={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    expect(screen.getByRole("button", { name: "重試" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "重試" }));

    resolveRetry({ ok: true, value: undefined });
    await waitFor(() => expect(mockedRetry).toHaveBeenCalledTimes(1));
  });
});
