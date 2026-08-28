import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the default message when neither message nor children is given", () => {
    render(<EmptyState />);

    expect(screen.getByText("目前沒有內容。")).toBeInTheDocument();
  });

  it("renders a custom message when provided", () => {
    render(<EmptyState message="尚無最近對話。" />);

    expect(screen.getByText("尚無最近對話。")).toBeInTheDocument();
  });

  it("prefers children over message", () => {
    render(<EmptyState message="ignored">自訂空狀態內容</EmptyState>);

    expect(screen.getByText("自訂空狀態內容")).toBeInTheDocument();
    expect(screen.queryByText("ignored")).not.toBeInTheDocument();
  });

  it("E01-S026: does not render an illustration container when no illustration prop is given", () => {
    const { container } = render(<EmptyState message="尚無內容。" />);

    expect(container.querySelector("[aria-hidden]")).not.toBeInTheDocument();
  });

  it("E01-S026: renders the illustration, marked aria-hidden, alongside the message when provided", () => {
    render(<EmptyState message="尚無內容。" illustration={<svg data-testid="empty-illustration" />} />);

    const illustration = screen.getByTestId("empty-illustration");
    expect(illustration.closest("[aria-hidden='true']")).toBeInTheDocument();
    expect(screen.getByText("尚無內容。")).toBeInTheDocument();
  });
});
