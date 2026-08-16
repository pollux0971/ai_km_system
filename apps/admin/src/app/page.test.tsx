import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminHomePage from "./page";

describe("AdminHomePage (E11-S001)", () => {
  it("renders the admin console landing heading", () => {
    render(<AdminHomePage />);

    expect(screen.getByRole("heading", { name: "AI KM 管理主控台", level: 1 })).toBeInTheDocument();
  });
});
