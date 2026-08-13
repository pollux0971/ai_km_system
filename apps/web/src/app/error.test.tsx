import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ErrorBoundary from "./error";

describe("app-level error boundary (E01-S018)", () => {
  it("renders the shared crash fallback and wires reset() to the retry button", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "abc123" });

    render(<ErrorBoundary error={error} reset={reset} />);

    expect(screen.getByRole("heading", { name: "發生未預期的錯誤" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("系統發生錯誤，請稍後再試。");

    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("never renders the raw error message to the user (no stack/message leak)", () => {
    const error = Object.assign(new Error("a secret internal stack trace detail"), { digest: "abc123" });

    render(<ErrorBoundary error={error} reset={vi.fn()} />);

    expect(screen.queryByText(/secret internal stack trace/)).not.toBeInTheDocument();
  });
});
