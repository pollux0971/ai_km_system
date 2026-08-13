import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Sidebar from "./sidebar";

describe("Sidebar", () => {
  it("renders a navigation landmark with a Home link", () => {
    render(<Sidebar />);

    const nav = screen.getByRole("navigation", { name: "主導覽" });
    const homeLink = screen.getByRole("link", { name: "首頁" });

    expect(nav).toContainElement(homeLink);
    expect(homeLink).toHaveAttribute("href", "/");
  });
});
