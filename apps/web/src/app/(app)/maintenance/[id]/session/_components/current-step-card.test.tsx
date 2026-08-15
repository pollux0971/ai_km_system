import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import CurrentStepCard from "./current-step-card";

describe("CurrentStepCard (E07-S007)", () => {
  it("shows the 1-indexed step number and the step's instruction text", () => {
    render(<CurrentStepCard step={{ stepIndex: 0, instruction: "測試步驟內容" }} />);

    expect(screen.getByRole("heading", { name: "步驟 1", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("測試步驟內容")).toBeInTheDocument();
  });

  it("derives the step number from stepIndex rather than hardcoding it", () => {
    render(<CurrentStepCard step={{ stepIndex: 3, instruction: "第四步內容" }} />);

    expect(screen.getByRole("heading", { name: "步驟 4", level: 2 })).toBeInTheDocument();
  });
});
