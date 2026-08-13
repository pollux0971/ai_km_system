import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CrashFallback } from "./crash-fallback";

describe("CrashFallback (E01-S018)", () => {
  it("renders a generic heading and the shared SERVER_ERROR message", () => {
    render(<CrashFallback />);

    expect(screen.getByRole("heading", { name: "發生未預期的錯誤" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("系統發生錯誤，請稍後再試。");
  });

  it("always offers a way out via a link back home", () => {
    render(<CrashFallback />);

    expect(screen.getByRole("link", { name: "回首頁" })).toHaveAttribute("href", "/");
  });

  it("shows a retry button that calls onRetry when one is provided", () => {
    const onRetry = vi.fn();
    render(<CrashFallback onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits the retry button when no onRetry is provided", () => {
    render(<CrashFallback />);

    expect(screen.queryByRole("button", { name: "重試" })).not.toBeInTheDocument();
  });
});
