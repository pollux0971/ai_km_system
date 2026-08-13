import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingIndicator, SkeletonBar } from "./loading";

describe("LoadingIndicator", () => {
  it("renders a status region with the default 載入中… label", () => {
    render(<LoadingIndicator />);

    expect(screen.getByRole("status")).toHaveTextContent("載入中…");
  });

  it("renders a custom label when provided", () => {
    render(<LoadingIndicator label="正在載入知識庫…" />);

    expect(screen.getByRole("status")).toHaveTextContent("正在載入知識庫…");
  });
});

describe("SkeletonBar", () => {
  it("is aria-hidden (purely visual — callers provide the accessible loading announcement)", () => {
    const { container } = render(<SkeletonBar />);

    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("applies a custom width when provided", () => {
    const { container } = render(<SkeletonBar width="60%" />);

    expect(container.firstChild).toHaveStyle({ width: "60%" });
  });
});
