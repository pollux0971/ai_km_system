import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ContinueDiagnosisPrompt from "./continue-diagnosis-prompt";
import { listMaintenanceCases } from "@/lib/maintenance-cases";
import { getDiagnosticSessionForCase, type DiagnosticSession } from "@/lib/diagnostic-sessions";

vi.mock("@/lib/maintenance-cases", () => ({
  listMaintenanceCases: vi.fn(),
}));

vi.mock("@/lib/diagnostic-sessions", () => ({
  getDiagnosticSessionForCase: vi.fn(),
}));

const mockedListMaintenanceCases = vi.mocked(listMaintenanceCases);
const mockedGetDiagnosticSessionForCase = vi.mocked(getDiagnosticSessionForCase);

const case1 = { id: "case1", title: "生產線 3 號機台異音診斷", updatedAt: "2026-08-14T06:30:00.000Z" };
const case2 = { id: "case2", title: "包裝機感測器故障排除", updatedAt: "2026-08-13T02:15:00.000Z" };

function session(overrides: Partial<DiagnosticSession> = {}): DiagnosticSession {
  return {
    id: "session1",
    maintenanceCaseId: "case1",
    status: "OPEN",
    currentStepIndex: 0,
    createdAt: "2026-08-14T06:00:00.000Z",
    updatedAt: "2026-08-14T06:30:00.000Z",
    ...overrides,
  };
}

describe("ContinueDiagnosisPrompt (E07-S024)", () => {
  it("renders nothing while loading (no loading spinner of its own — a supplementary prompt, not primary content)", () => {
    mockedListMaintenanceCases.mockReturnValue(new Promise(() => {}));

    const { container } = render(<ContinueDiagnosisPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are no cases at all", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [] });

    const { container } = render(<ContinueDiagnosisPrompt />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when no case has an OPEN or IN_PROGRESS session", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: session({ status: "RESOLVED" }) });

    const { container } = render(<ContinueDiagnosisPrompt />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when a case has no diagnostic session yet", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: null });

    const { container } = render(<ContinueDiagnosisPrompt />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a 繼續進行中的診斷 heading and a real link for an OPEN case", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: session({ status: "OPEN" }) });

    render(<ContinueDiagnosisPrompt />);

    expect(await screen.findByRole("heading", { name: "繼續進行中的診斷" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /生產線 3 號機台異音診斷/ });
    expect(link).toHaveAttribute("href", "/maintenance/case1/session");
    expect(screen.getByText("待處理")).toBeInTheDocument();
  });

  it("shows an IN_PROGRESS case too, with its own status label", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: session({ status: "IN_PROGRESS" }) });

    render(<ContinueDiagnosisPrompt />);

    expect(await screen.findByText("進行中")).toBeInTheDocument();
  });

  it("shows multiple active cases, each with its own link, and excludes terminal/not-started ones from the same list", async () => {
    const case3 = { id: "case3", title: "空壓機無法啟動", updatedAt: "2026-08-12T02:15:00.000Z" };
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1, case2, case3] });
    mockedGetDiagnosticSessionForCase.mockImplementation(async (maintenanceCaseId) => {
      if (maintenanceCaseId === "case1") return { ok: true, value: session({ status: "OPEN" }) };
      if (maintenanceCaseId === "case2") return { ok: true, value: session({ id: "s2", maintenanceCaseId: "case2", status: "IN_PROGRESS" }) };
      return { ok: true, value: session({ id: "s3", maintenanceCaseId: "case3", status: "RESOLVED" }) };
    });

    render(<ContinueDiagnosisPrompt />);

    expect(await screen.findByRole("link", { name: /生產線 3 號機台異音診斷/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /包裝機感測器故障排除/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /空壓機無法啟動/ })).not.toBeInTheDocument();
  });

  it("degrades to rendering nothing (not an error message) when the case list fails to load", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    const { container } = render(<ContinueDiagnosisPrompt />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("degrades to rendering nothing when a diagnostic session lookup fails, rather than breaking the whole prompt", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    const { container } = render(<ContinueDiagnosisPrompt />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
