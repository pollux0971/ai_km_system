import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminHomePage from "./page";

describe("AdminHomePage (E11-S001)", () => {
  it("renders the admin console landing heading", () => {
    render(<AdminHomePage />);

    expect(screen.getByRole("heading", { name: "AI KM 管理主控台", level: 1 })).toBeInTheDocument();
  });
});

describe("AdminHomePage entry links (E11-S002)", () => {
  it("links to the user list", () => {
    render(<AdminHomePage />);

    expect(screen.getByRole("link", { name: "使用者管理" })).toHaveAttribute("href", "/users");
  });
});
