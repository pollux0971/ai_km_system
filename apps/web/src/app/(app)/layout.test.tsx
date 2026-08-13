import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AppShellLayout from "./layout";

describe("AppShellLayout", () => {
  it("passes children through unchanged (chrome lands in E01-S005)", () => {
    render(
      <AppShellLayout>
        <p>child content</p>
      </AppShellLayout>,
    );

    expect(screen.getByText("child content")).toBeInTheDocument();
  });
});
