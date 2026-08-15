import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CurrentStepCard from "./current-step-card";
import {
  escalateDiagnosticSession,
  goToPreviousStep,
  restartDiagnosticSession,
  selectDecisionOption,
  skipDiagnosticStep,
} from "@/lib/diagnostic-sessions";
import { explainDiagnosticStep } from "@/lib/diagnostic-explanations";
import { getDiagnosticStepCitation } from "@/lib/diagnostic-citations";

vi.mock("@/lib/diagnostic-sessions", () => ({
  selectDecisionOption: vi.fn(),
  goToPreviousStep: vi.fn(),
  restartDiagnosticSession: vi.fn(),
  skipDiagnosticStep: vi.fn(),
  escalateDiagnosticSession: vi.fn(),
}));

vi.mock("@/lib/diagnostic-explanations", () => ({
  explainDiagnosticStep: vi.fn(),
}));

vi.mock("@/lib/diagnostic-citations", () => ({
  getDiagnosticStepCitation: vi.fn(),
}));

const mockedSelectDecisionOption = vi.mocked(selectDecisionOption);
const mockedGoToPreviousStep = vi.mocked(goToPreviousStep);
const mockedRestartDiagnosticSession = vi.mocked(restartDiagnosticSession);
const mockedSkipDiagnosticStep = vi.mocked(skipDiagnosticStep);
const mockedExplainDiagnosticStep = vi.mocked(explainDiagnosticStep);
const mockedGetDiagnosticStepCitation = vi.mocked(getDiagnosticStepCitation);
const mockedEscalateDiagnosticSession = vi.mocked(escalateDiagnosticSession);

function makePhoto(name: string, sizeBytes: number, type = "image/jpeg"): File {
  const file = new File(["x".repeat(Math.min(sizeBytes, 1))], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

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

describe("CurrentStepCard free-text detail (E07-S009)", () => {
  const stepWithOptions = {
    stepIndex: 0,
    instruction: "測試步驟內容",
    options: [
      { id: "opt-a", label: "選項甲" },
      { id: "opt-b", label: "選項乙" },
    ],
  };
  const advancedSession = {
    id: "session1",
    maintenanceCaseId: "case1",
    status: "IN_PROGRESS" as const,
    currentStepIndex: 1,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:01:00.000Z",
  };

  beforeEach(() => {
    mockedSelectDecisionOption.mockReset();
  });

  it("renders a free-text detail textarea alongside the options", () => {
    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={() => {}} />);

    expect(screen.getByLabelText("補充說明")).toBeInTheDocument();
  });

  it("does not render a free-text detail textarea when the step has no options (nothing to submit it alongside)", () => {
    render(<CurrentStepCard step={{ stepIndex: 1, instruction: "測試步驟內容" }} />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("passes the trimmed detail as a third argument when selecting an option after typing", async () => {
    mockedSelectDecisionOption.mockResolvedValue({ ok: true, value: { ...advancedSession, lastSelectedOptionId: "opt-a", lastFreeTextDetail: "現場有異音" } });

    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={() => {}} />);
    fireEvent.change(screen.getByLabelText("補充說明"), { target: { value: "  現場有異音  " } });
    fireEvent.click(screen.getByRole("button", { name: "選項甲" }));

    expect(mockedSelectDecisionOption).toHaveBeenCalledWith("session1", "opt-a", "現場有異音");
  });

  it("omits the detail argument entirely when the textarea is left blank — same 2-argument call shape E07-S008's own test already locks in", () => {
    mockedSelectDecisionOption.mockResolvedValue({ ok: true, value: { ...advancedSession, lastSelectedOptionId: "opt-a" } });

    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "選項甲" }));

    expect(mockedSelectDecisionOption).toHaveBeenCalledWith("session1", "opt-a");
  });

  it("omits the detail argument when the textarea contains only whitespace", () => {
    mockedSelectDecisionOption.mockResolvedValue({ ok: true, value: { ...advancedSession, lastSelectedOptionId: "opt-a" } });

    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={() => {}} />);
    fireEvent.change(screen.getByLabelText("補充說明"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "選項甲" }));

    expect(mockedSelectDecisionOption).toHaveBeenCalledWith("session1", "opt-a");
  });

  it("shows a previously recorded detail when the session already has one", () => {
    render(<CurrentStepCard step={{ stepIndex: 1, instruction: "測試步驟內容" }} recordedDetail="現場有明顯異音" />);

    expect(screen.getByText("現場有明顯異音")).toBeInTheDocument();
  });

  it("shows nothing extra when there is no recorded detail yet", () => {
    render(<CurrentStepCard step={{ stepIndex: 0, instruction: "測試步驟內容" }} />);

    expect(screen.queryByText("您的補充說明", { exact: false })).not.toBeInTheDocument();
  });
});

describe("CurrentStepCard previous-step action (E07-S010)", () => {
  const advancedSession = {
    id: "session1",
    maintenanceCaseId: "case1",
    status: "IN_PROGRESS" as const,
    currentStepIndex: 0,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:02:00.000Z",
  };

  beforeEach(() => {
    mockedGoToPreviousStep.mockReset();
  });

  it("renders a 上一步 button when stepIndex is greater than 0", () => {
    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 1, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);

    expect(screen.getByRole("button", { name: "上一步" })).toBeInTheDocument();
  });

  it("does not render a 上一步 button on the first step", () => {
    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);

    expect(screen.queryByRole("button", { name: "上一步" })).not.toBeInTheDocument();
  });

  it("clicking 上一步 calls goToPreviousStep and invokes onAdvanced with the updated session on success", async () => {
    mockedGoToPreviousStep.mockResolvedValue({ ok: true, value: advancedSession });
    const onAdvanced = vi.fn();

    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 1, instruction: "測試步驟內容" }} onAdvanced={onAdvanced} />);
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));

    expect(mockedGoToPreviousStep).toHaveBeenCalledWith("session1");
    await waitFor(() => expect(onAdvanced).toHaveBeenCalledWith(advancedSession));
  });

  it("shows an error message and does not call onAdvanced when going back fails", async () => {
    mockedGoToPreviousStep.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "已經是第一步。" } });
    const onAdvanced = vi.fn();

    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 1, instruction: "測試步驟內容" }} onAdvanced={onAdvanced} />);
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("已經是第一步。");
    expect(onAdvanced).not.toHaveBeenCalled();
  });
});

describe("CurrentStepCard restart action (E07-S011)", () => {
  const restartedSession = {
    id: "session1",
    maintenanceCaseId: "case1",
    status: "OPEN" as const,
    currentStepIndex: 0,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:03:00.000Z",
  };

  beforeEach(() => {
    mockedRestartDiagnosticSession.mockReset();
  });

  it("renders a 重新開始 button whenever sessionId is present, even on the very first step", () => {
    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);

    expect(screen.getByRole("button", { name: "重新開始" })).toBeInTheDocument();
  });

  it("does not render a 重新開始 button when sessionId is absent (S007 behavior unchanged)", () => {
    render(<CurrentStepCard step={{ stepIndex: 0, instruction: "測試步驟內容" }} />);

    expect(screen.queryByRole("button", { name: "重新開始" })).not.toBeInTheDocument();
  });

  it("clicking 重新開始 calls restartDiagnosticSession and invokes onAdvanced with the updated session on success", async () => {
    mockedRestartDiagnosticSession.mockResolvedValue({ ok: true, value: restartedSession });
    const onAdvanced = vi.fn();

    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 1, instruction: "測試步驟內容" }} onAdvanced={onAdvanced} />);
    fireEvent.click(screen.getByRole("button", { name: "重新開始" }));

    expect(mockedRestartDiagnosticSession).toHaveBeenCalledWith("session1");
    await waitFor(() => expect(onAdvanced).toHaveBeenCalledWith(restartedSession));
  });

  it("shows an error message and does not call onAdvanced when restarting fails", async () => {
    mockedRestartDiagnosticSession.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個診斷 session。" } });
    const onAdvanced = vi.fn();

    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 1, instruction: "測試步驟內容" }} onAdvanced={onAdvanced} />);
    fireEvent.click(screen.getByRole("button", { name: "重新開始" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到這個診斷 session。");
    expect(onAdvanced).not.toHaveBeenCalled();
  });
});

describe("CurrentStepCard skip-step action (E07-S012)", () => {
  const stepWithOptions = {
    stepIndex: 0,
    instruction: "測試步驟內容",
    options: [
      { id: "opt-a", label: "選項甲" },
      { id: "opt-b", label: "選項乙" },
    ],
  };
  const skippedSession = {
    id: "session1",
    maintenanceCaseId: "case1",
    status: "IN_PROGRESS" as const,
    currentStepIndex: 1,
    lastSkipReason: "現場暫時無法安全接近設備",
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:04:00.000Z",
  };

  beforeEach(() => {
    mockedSkipDiagnosticStep.mockReset();
  });

  it("renders a 略過原因 textarea and 跳過此步驟 button alongside the options", () => {
    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={() => {}} />);

    expect(screen.getByLabelText("略過原因")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "跳過此步驟" })).toBeInTheDocument();
  });

  it("does not render skip UI when the step has no options (nothing to skip)", () => {
    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 1, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);

    expect(screen.queryByLabelText("略過原因")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "跳過此步驟" })).not.toBeInTheDocument();
  });

  it("keeps 跳過此步驟 disabled until a reason is typed", () => {
    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={() => {}} />);

    expect(screen.getByRole("button", { name: "跳過此步驟" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("略過原因"), { target: { value: "現場暫時無法安全接近設備" } });

    expect(screen.getByRole("button", { name: "跳過此步驟" })).not.toBeDisabled();
  });

  it("stays disabled for a whitespace-only reason", () => {
    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={() => {}} />);

    fireEvent.change(screen.getByLabelText("略過原因"), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "跳過此步驟" })).toBeDisabled();
  });

  it("clicking 跳過此步驟 calls skipDiagnosticStep with the trimmed reason and invokes onAdvanced on success", async () => {
    mockedSkipDiagnosticStep.mockResolvedValue({ ok: true, value: skippedSession });
    const onAdvanced = vi.fn();

    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={onAdvanced} />);
    fireEvent.change(screen.getByLabelText("略過原因"), { target: { value: "  現場暫時無法安全接近設備  " } });
    fireEvent.click(screen.getByRole("button", { name: "跳過此步驟" }));

    expect(mockedSkipDiagnosticStep).toHaveBeenCalledWith("session1", "現場暫時無法安全接近設備");
    await waitFor(() => expect(onAdvanced).toHaveBeenCalledWith(skippedSession));
  });

  it("shows an error message and does not call onAdvanced when skipping fails", async () => {
    mockedSkipDiagnosticStep.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "請填寫略過原因。" } });
    const onAdvanced = vi.fn();

    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={onAdvanced} />);
    fireEvent.change(screen.getByLabelText("略過原因"), { target: { value: "原因" } });
    fireEvent.click(screen.getByRole("button", { name: "跳過此步驟" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("請填寫略過原因。");
    expect(onAdvanced).not.toHaveBeenCalled();
  });

  it("shows a previously recorded skip reason when the session already has one", () => {
    render(<CurrentStepCard step={{ stepIndex: 1, instruction: "測試步驟內容" }} recordedSkipReason="現場暫時無法安全接近設備" />);

    expect(screen.getByText("現場暫時無法安全接近設備")).toBeInTheDocument();
  });

  it("shows nothing extra when there is no recorded skip reason yet", () => {
    render(<CurrentStepCard step={{ stepIndex: 0, instruction: "測試步驟內容" }} />);

    expect(screen.queryByText("已略過此步驟", { exact: false })).not.toBeInTheDocument();
  });
});

describe("CurrentStepCard photo upload (E07-S013)", () => {
  const stepWithOptions = {
    stepIndex: 0,
    instruction: "測試步驟內容",
    options: [
      { id: "opt-a", label: "選項甲" },
      { id: "opt-b", label: "選項乙" },
    ],
  };
  const advancedSession = {
    id: "session1",
    maintenanceCaseId: "case1",
    status: "IN_PROGRESS" as const,
    currentStepIndex: 1,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:01:00.000Z",
  };

  beforeEach(() => {
    mockedSelectDecisionOption.mockReset();
  });

  it("renders a file input for attaching a photo alongside the options", () => {
    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={() => {}} />);

    expect(screen.getByLabelText("附加照片")).toBeInTheDocument();
  });

  it("does not render a photo input when the step has no options (nothing to attach it alongside)", () => {
    render(<CurrentStepCard step={{ stepIndex: 1, instruction: "測試步驟內容" }} />);

    expect(screen.queryByLabelText("附加照片")).not.toBeInTheDocument();
  });

  it("shows the selected photo's name and formatted size once chosen", () => {
    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={() => {}} />);

    fireEvent.change(screen.getByLabelText("附加照片"), { target: { files: [makePhoto("現場照片.jpg", 2_500_000)] } });

    expect(screen.getByText("現場照片.jpg", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("2.4 MB", { exact: false })).toBeInTheDocument();
  });

  it("clicking 移除相片 clears the selected photo", () => {
    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={() => {}} />);
    fireEvent.change(screen.getByLabelText("附加照片"), { target: { files: [makePhoto("現場照片.jpg", 1024)] } });
    expect(screen.getByText("現場照片.jpg", { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "移除相片" }));

    expect(screen.queryByText("現場照片.jpg", { exact: false })).not.toBeInTheDocument();
  });

  it("passes the selected photo as a fourth argument when selecting an option, with detail omitted as undefined", async () => {
    mockedSelectDecisionOption.mockResolvedValue({ ok: true, value: { ...advancedSession, lastPhotoFileName: "現場照片.jpg", lastPhotoSizeBytes: 1024 } });
    const photo = makePhoto("現場照片.jpg", 1024);

    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={() => {}} />);
    fireEvent.change(screen.getByLabelText("附加照片"), { target: { files: [photo] } });
    fireEvent.click(screen.getByRole("button", { name: "選項甲" }));

    expect(mockedSelectDecisionOption).toHaveBeenCalledWith("session1", "opt-a", undefined, photo);
  });

  it("passes both the trimmed detail and the selected photo together when both are provided", async () => {
    mockedSelectDecisionOption.mockResolvedValue({
      ok: true,
      value: { ...advancedSession, lastFreeTextDetail: "面板顯示錯誤代碼 E12", lastPhotoFileName: "錯誤代碼.png", lastPhotoSizeBytes: 2048 },
    });
    const photo = makePhoto("錯誤代碼.png", 2048, "image/png");

    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={() => {}} />);
    fireEvent.change(screen.getByLabelText("補充說明"), { target: { value: "面板顯示錯誤代碼 E12" } });
    fireEvent.change(screen.getByLabelText("附加照片"), { target: { files: [photo] } });
    fireEvent.click(screen.getByRole("button", { name: "選項甲" }));

    expect(mockedSelectDecisionOption).toHaveBeenCalledWith("session1", "opt-a", "面板顯示錯誤代碼 E12", photo);
  });

  it("shows a previously recorded photo when the session already has one", () => {
    render(
      <CurrentStepCard
        step={{ stepIndex: 1, instruction: "測試步驟內容" }}
        recordedPhotoFileName="現場照片.jpg"
        recordedPhotoSizeBytes={2_500_000}
      />,
    );

    expect(screen.getByText("現場照片.jpg", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("2.4 MB", { exact: false })).toBeInTheDocument();
  });

  it("shows nothing extra when there is no recorded photo yet", () => {
    render(<CurrentStepCard step={{ stepIndex: 0, instruction: "測試步驟內容" }} />);

    expect(screen.queryByText("已附加照片", { exact: false })).not.toBeInTheDocument();
  });
});

describe("CurrentStepCard AI explain-step panel (E07-S014)", () => {
  beforeEach(() => {
    mockedExplainDiagnosticStep.mockReset();
  });

  it("renders an AI 說明 button when sessionId is present", () => {
    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);

    expect(screen.getByRole("button", { name: "AI 說明" })).toBeInTheDocument();
  });

  it("does not render an AI 說明 button when sessionId is absent (S007 behavior unchanged)", () => {
    render(<CurrentStepCard step={{ stepIndex: 0, instruction: "測試步驟內容" }} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("clicking AI 說明 shows a loading indicator, then the explanation once resolved", async () => {
    let resolveExplain: (value: { ok: true; value: string }) => void = () => {};
    mockedExplainDiagnosticStep.mockReturnValue(
      new Promise((resolve) => {
        resolveExplain = resolve;
      }),
    );

    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "AI 說明" }));

    expect(await screen.findByRole("status")).toBeInTheDocument();

    resolveExplain({ ok: true, value: "（模擬說明）這是測試用的說明文字。" });

    expect(await screen.findByText("（模擬說明）這是測試用的說明文字。")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clicking AI 說明 a second time collapses the panel", async () => {
    mockedExplainDiagnosticStep.mockResolvedValue({ ok: true, value: "（模擬說明）這是測試用的說明文字。" });

    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "AI 說明" }));
    expect(await screen.findByText("（模擬說明）這是測試用的說明文字。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收合 AI 說明" }));

    expect(screen.queryByText("（模擬說明）這是測試用的說明文字。")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 說明" })).toBeInTheDocument();
  });

  it("re-opening an already-loaded explanation does not call explainDiagnosticStep a second time", async () => {
    mockedExplainDiagnosticStep.mockResolvedValue({ ok: true, value: "（模擬說明）這是測試用的說明文字。" });

    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "AI 說明" }));
    await screen.findByText("（模擬說明）這是測試用的說明文字。");
    fireEvent.click(screen.getByRole("button", { name: "收合 AI 說明" }));

    fireEvent.click(screen.getByRole("button", { name: "AI 說明" }));

    expect(await screen.findByText("（模擬說明）這是測試用的說明文字。")).toBeInTheDocument();
    expect(mockedExplainDiagnosticStep).toHaveBeenCalledTimes(1);
  });

  it("shows an error message when loading the explanation fails", async () => {
    mockedExplainDiagnosticStep.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個步驟的說明。" } });

    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "AI 說明" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到這個步驟的說明。");
  });

  it("does not disable the explain button while an unrelated mutation (option selection) is pending", async () => {
    let resolveSelect: (value: Awaited<ReturnType<typeof selectDecisionOption>>) => void = () => {};
    mockedSelectDecisionOption.mockReturnValue(
      new Promise((resolve) => {
        resolveSelect = resolve;
      }),
    );
    const stepWithOptions = {
      stepIndex: 0,
      instruction: "測試步驟內容",
      options: [{ id: "opt-a", label: "選項甲" }],
    };

    render(<CurrentStepCard sessionId="session1" step={stepWithOptions} onAdvanced={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "選項甲" }));

    expect(screen.getByRole("button", { name: "AI 說明" })).not.toBeDisabled();
    resolveSelect({ ok: true, value: { id: "session1", maintenanceCaseId: "case1", status: "IN_PROGRESS", currentStepIndex: 1, createdAt: "", updatedAt: "" } });
  });
});

describe("CurrentStepCard SOP citation component (E07-S015)", () => {
  const sampleCitation = {
    id: "sop-diag-01",
    title: "（模擬 SOP）設備異常初步診斷標準作業程序",
    section: "第 2 節：異常現象記錄",
    snippet: "（模擬片段）操作人員應於發現異常時，記錄觀察到的聲音、燈號與錯誤訊息，作為後續判斷依據。",
  };

  beforeEach(() => {
    mockedGetDiagnosticStepCitation.mockReset();
  });

  it("renders a SOP 引用來源 button when sessionId is present", () => {
    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);

    expect(screen.getByRole("button", { name: "SOP 引用來源" })).toBeInTheDocument();
  });

  it("does not render a SOP 引用來源 button when sessionId is absent (S007 behavior unchanged)", () => {
    render(<CurrentStepCard step={{ stepIndex: 0, instruction: "測試步驟內容" }} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("clicking SOP 引用來源 shows a loading indicator, then the citation once resolved", async () => {
    let resolveCitation: (value: Awaited<ReturnType<typeof getDiagnosticStepCitation>>) => void = () => {};
    mockedGetDiagnosticStepCitation.mockReturnValue(
      new Promise((resolve) => {
        resolveCitation = resolve;
      }),
    );

    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "SOP 引用來源" }));

    expect(await screen.findByRole("status")).toBeInTheDocument();

    resolveCitation({ ok: true, value: sampleCitation });

    expect(await screen.findByText(sampleCitation.title, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(sampleCitation.snippet, { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clicking SOP 引用來源 a second time collapses the panel", async () => {
    mockedGetDiagnosticStepCitation.mockResolvedValue({ ok: true, value: sampleCitation });

    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "SOP 引用來源" }));
    expect(await screen.findByText(sampleCitation.title, { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收合 SOP 引用來源" }));

    expect(screen.queryByText(sampleCitation.title, { exact: false })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SOP 引用來源" })).toBeInTheDocument();
  });

  it("re-opening an already-loaded citation does not call getDiagnosticStepCitation a second time", async () => {
    mockedGetDiagnosticStepCitation.mockResolvedValue({ ok: true, value: sampleCitation });

    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "SOP 引用來源" }));
    await screen.findByText(sampleCitation.title, { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "收合 SOP 引用來源" }));

    fireEvent.click(screen.getByRole("button", { name: "SOP 引用來源" }));

    expect(await screen.findByText(sampleCitation.title, { exact: false })).toBeInTheDocument();
    expect(mockedGetDiagnosticStepCitation).toHaveBeenCalledTimes(1);
  });

  it("shows an error message when loading the citation fails", async () => {
    mockedGetDiagnosticStepCitation.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個步驟的 SOP 引用來源。" } });

    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "SOP 引用來源" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到這個步驟的 SOP 引用來源。");
  });

  it("operates independently from the AI 說明 panel — opening one does not affect the other", async () => {
    mockedExplainDiagnosticStep.mockResolvedValue({ ok: true, value: "（模擬說明）這是測試用的說明文字。" });
    mockedGetDiagnosticStepCitation.mockResolvedValue({ ok: true, value: sampleCitation });

    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "AI 說明" }));
    expect(await screen.findByText("（模擬說明）這是測試用的說明文字。")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "SOP 引用來源" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "SOP 引用來源" }));
    expect(await screen.findByText(sampleCitation.title, { exact: false })).toBeInTheDocument();

    expect(screen.getByText("（模擬說明）這是測試用的說明文字。")).toBeInTheDocument();
    expect(mockedExplainDiagnosticStep).toHaveBeenCalledTimes(1);
  });
});

describe("CurrentStepCard safety warning component (E07-S016)", () => {
  it("shows the step's safety warning when present", () => {
    render(
      <CurrentStepCard
        sessionId="session1"
        step={{ stepIndex: 0, instruction: "測試步驟內容", safetyWarning: "（模擬警告）測試用的安全警告文字。" }}
        onAdvanced={() => {}}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("（模擬警告）測試用的安全警告文字。");
  });

  it("shows nothing extra when the step has no safety warning", () => {
    render(<CurrentStepCard step={{ stepIndex: 1, instruction: "測試步驟內容" }} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders even when sessionId is absent — safety information isn't gated behind an active session", () => {
    render(<CurrentStepCard step={{ stepIndex: 0, instruction: "測試步驟內容", safetyWarning: "（模擬警告）測試用的安全警告文字。" }} />);

    expect(screen.getByRole("alert")).toHaveTextContent("（模擬警告）測試用的安全警告文字。");
  });
});

describe("CurrentStepCard high-risk confirmation gate (E07-S017)", () => {
  const stepWithWarningAndOptions = {
    stepIndex: 0,
    instruction: "測試步驟內容",
    safetyWarning: "（模擬警告）測試用的安全警告文字。",
    options: [
      { id: "opt-a", label: "選項甲" },
      { id: "opt-b", label: "選項乙" },
    ],
  };

  beforeEach(() => {
    mockedSelectDecisionOption.mockReset();
    mockedSkipDiagnosticStep.mockReset();
  });

  it("renders a confirmation checkbox when the step has a safety warning", () => {
    render(<CurrentStepCard sessionId="session1" step={stepWithWarningAndOptions} onAdvanced={() => {}} />);

    expect(screen.getByLabelText("我已閱讀並了解上述安全警告")).toBeInTheDocument();
  });

  it("does not render a confirmation checkbox when the step has no safety warning", () => {
    const stepWithOptionsOnly = { stepIndex: 0, instruction: "測試步驟內容", options: stepWithWarningAndOptions.options };

    render(<CurrentStepCard sessionId="session1" step={stepWithOptionsOnly} onAdvanced={() => {}} />);

    expect(screen.queryByLabelText("我已閱讀並了解上述安全警告")).not.toBeInTheDocument();
  });

  it("keeps the option buttons disabled until the confirmation checkbox is checked", () => {
    render(<CurrentStepCard sessionId="session1" step={stepWithWarningAndOptions} onAdvanced={() => {}} />);

    expect(screen.getByRole("button", { name: "選項甲" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("我已閱讀並了解上述安全警告"));

    expect(screen.getByRole("button", { name: "選項甲" })).not.toBeDisabled();
  });

  it("keeps the skip button disabled until the confirmation checkbox is checked, even with a reason typed", () => {
    render(<CurrentStepCard sessionId="session1" step={stepWithWarningAndOptions} onAdvanced={() => {}} />);
    fireEvent.change(screen.getByLabelText("略過原因"), { target: { value: "現場暫時無法安全接近設備" } });

    expect(screen.getByRole("button", { name: "跳過此步驟" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("我已閱讀並了解上述安全警告"));

    expect(screen.getByRole("button", { name: "跳過此步驟" })).not.toBeDisabled();
  });

  it("unchecking the confirmation checkbox re-disables the option buttons", () => {
    render(<CurrentStepCard sessionId="session1" step={stepWithWarningAndOptions} onAdvanced={() => {}} />);
    const checkbox = screen.getByLabelText("我已閱讀並了解上述安全警告");
    fireEvent.click(checkbox);
    expect(screen.getByRole("button", { name: "選項甲" })).not.toBeDisabled();

    fireEvent.click(checkbox);

    expect(screen.getByRole("button", { name: "選項甲" })).toBeDisabled();
  });

  it("clicking a now-enabled option button after confirming still calls selectDecisionOption normally", async () => {
    mockedSelectDecisionOption.mockResolvedValue({
      ok: true,
      value: { id: "session1", maintenanceCaseId: "case1", status: "IN_PROGRESS", currentStepIndex: 1, lastSelectedOptionId: "opt-a", createdAt: "", updatedAt: "" },
    });

    render(<CurrentStepCard sessionId="session1" step={stepWithWarningAndOptions} onAdvanced={() => {}} />);
    fireEvent.click(screen.getByLabelText("我已閱讀並了解上述安全警告"));
    fireEvent.click(screen.getByRole("button", { name: "選項甲" }));

    expect(mockedSelectDecisionOption).toHaveBeenCalledWith("session1", "opt-a");
  });
});

describe("CurrentStepCard escalation action (E07-S018)", () => {
  const escalatedSession = {
    id: "session1",
    maintenanceCaseId: "case1",
    status: "ESCALATED" as const,
    currentStepIndex: 0,
    lastEscalationReason: "現場情況超出可自行處理範圍",
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:05:00.000Z",
  };

  beforeEach(() => {
    mockedEscalateDiagnosticSession.mockReset();
  });

  it("renders an 升級此案例 button and 升級原因 textarea when sessionId is present", () => {
    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);

    expect(screen.getByLabelText("升級原因")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "升級此案例" })).toBeInTheDocument();
  });

  it("does not render escalation UI when sessionId is absent (S007 behavior unchanged)", () => {
    render(<CurrentStepCard step={{ stepIndex: 0, instruction: "測試步驟內容" }} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("keeps 升級此案例 disabled until a reason is typed", () => {
    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);

    expect(screen.getByRole("button", { name: "升級此案例" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("升級原因"), { target: { value: "現場情況超出可自行處理範圍" } });

    expect(screen.getByRole("button", { name: "升級此案例" })).not.toBeDisabled();
  });

  it("stays disabled for a whitespace-only reason", () => {
    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={() => {}} />);

    fireEvent.change(screen.getByLabelText("升級原因"), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "升級此案例" })).toBeDisabled();
  });

  it("clicking 升級此案例 calls escalateDiagnosticSession with the trimmed reason and invokes onAdvanced on success", async () => {
    mockedEscalateDiagnosticSession.mockResolvedValue({ ok: true, value: escalatedSession });
    const onAdvanced = vi.fn();

    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={onAdvanced} />);
    fireEvent.change(screen.getByLabelText("升級原因"), { target: { value: "  現場情況超出可自行處理範圍  " } });
    fireEvent.click(screen.getByRole("button", { name: "升級此案例" }));

    expect(mockedEscalateDiagnosticSession).toHaveBeenCalledWith("session1", "現場情況超出可自行處理範圍");
    await waitFor(() => expect(onAdvanced).toHaveBeenCalledWith(escalatedSession));
  });

  it("shows an error message and does not call onAdvanced when escalating fails", async () => {
    mockedEscalateDiagnosticSession.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "請填寫升級原因。" } });
    const onAdvanced = vi.fn();

    render(<CurrentStepCard sessionId="session1" step={{ stepIndex: 0, instruction: "測試步驟內容" }} onAdvanced={onAdvanced} />);
    fireEvent.change(screen.getByLabelText("升級原因"), { target: { value: "原因" } });
    fireEvent.click(screen.getByRole("button", { name: "升級此案例" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("請填寫升級原因。");
    expect(onAdvanced).not.toHaveBeenCalled();
  });

  it("shows a previously recorded escalation reason when the session already has one, and hides the escalation UI", () => {
    render(
      <CurrentStepCard
        sessionId="session1"
        step={{ stepIndex: 0, instruction: "測試步驟內容" }}
        recordedEscalationReason="現場情況超出可自行處理範圍"
      />,
    );

    expect(screen.getByText("現場情況超出可自行處理範圍")).toBeInTheDocument();
    expect(screen.queryByLabelText("升級原因")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "升級此案例" })).not.toBeInTheDocument();
  });

  it("shows nothing extra when there is no recorded escalation yet", () => {
    render(<CurrentStepCard step={{ stepIndex: 0, instruction: "測試步驟內容" }} />);

    expect(screen.queryByText("已升級此案例", { exact: false })).not.toBeInTheDocument();
  });

  it("escalating works even when a high-risk step's safety warning hasn't been acknowledged (E07-S017 gate does not apply)", async () => {
    mockedEscalateDiagnosticSession.mockResolvedValue({ ok: true, value: escalatedSession });
    const onAdvanced = vi.fn();
    const stepWithWarning = { stepIndex: 0, instruction: "測試步驟內容", safetyWarning: "（模擬警告）測試用的安全警告文字。" };

    render(<CurrentStepCard sessionId="session1" step={stepWithWarning} onAdvanced={onAdvanced} />);
    fireEvent.change(screen.getByLabelText("升級原因"), { target: { value: "現場情況超出可自行處理範圍" } });

    expect(screen.getByRole("button", { name: "升級此案例" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "升級此案例" }));

    expect(mockedEscalateDiagnosticSession).toHaveBeenCalledWith("session1", "現場情況超出可自行處理範圍");
    await waitFor(() => expect(onAdvanced).toHaveBeenCalledWith(escalatedSession));
  });
});
