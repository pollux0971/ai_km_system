import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "./not-found";

describe("NotFound", () => {
  it("renders a not-found message with a link back home", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { name: "頁面不存在" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回首頁" })).toHaveAttribute("href", "/");
  });
});
