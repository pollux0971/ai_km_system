import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CurrentStepCard from "./current-step-card";
import { selectDecisionOption } from "@/lib/diagnostic-sessions";

vi.mock("@/lib/diagnostic-sessions", () => ({
  selectDecisionOption: vi.fn(),
}));

const mockedSelectDecisionOption = vi.mocked(selectDecisionOption);

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

  it("renders no option buttons when the step has no options (S007 behavior unchanged)", () => {
    render(<CurrentStepCard step={{ stepIndex: 0, instruction: "測試步驟內容" }} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("CurrentStepCard decision options (E07-S008)", () => {
  const stepWithOptions = {
    stepIndex: 0,
    instruction: "測試步驟內容",
    options: [
      { id: "opt-a", label: "選項甲" },
      { id: "opt-b", label: "選項乙" },
    ],
  };

  beforeEach(() => {
    mockedSelectDecisionOption.mockReset();
  });

  it("renders each decision option as a clickable button", () => {
    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={() => {}} />);

    expect(screen.getByRole("button", { name: "選項甲" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "選項乙" })).toBeInTheDocument();
  });

  it("selecting an option calls selectDecisionOption and invokes onAdvanced with the updated session on success", async () => {
    const updatedSession = {
      id: "session1",
      maintenanceCaseId: "case1",
      status: "IN_PROGRESS" as const,
      currentStepIndex: 1,
      lastSelectedOptionId: "opt-a",
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:01:00.000Z",
    };
    mockedSelectDecisionOption.mockResolvedValue({ ok: true, value: updatedSession });
    const onAdvanced = vi.fn();

    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={onAdvanced} />);
    fireEvent.click(screen.getByRole("button", { name: "選項甲" }));

    expect(mockedSelectDecisionOption).toHaveBeenCalledWith("session1", "opt-a");
    await waitFor(() => expect(onAdvanced).toHaveBeenCalledWith(updatedSession));
  });

  it("shows an error message and does not call onAdvanced when selecting an option fails", async () => {
    mockedSelectDecisionOption.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "無法選擇這個選項。" } });
    const onAdvanced = vi.fn();

    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={onAdvanced} />);
    fireEvent.click(screen.getByRole("button", { name: "選項甲" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("無法選擇這個選項。");
    expect(onAdvanced).not.toHaveBeenCalled();
  });
});
