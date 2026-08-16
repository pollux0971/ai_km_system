import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ErpQueryDetail from "./erp-query-detail";
import { confirmErpQuery, executeErpQuery, getErpQuery, selectErpQueryScenario } from "@/lib/erp-queries";
import { matchErpScenarios } from "@/lib/erp-scenarios";
import { simulateErpQueryExecution } from "@/lib/erp-execution";
import { getErpResultSummary } from "@/lib/erp-results";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/erp-queries", () => ({
  getErpQuery: vi.fn(),
  selectErpQueryScenario: vi.fn(),
  confirmErpQuery: vi.fn(),
  executeErpQuery: vi.fn(),
}));

vi.mock("@/lib/erp-execution", () => ({
  simulateErpQueryExecution: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedGetErpQuery = vi.mocked(getErpQuery);
const mockedSelectErpQueryScenario = vi.mocked(selectErpQueryScenario);
const mockedConfirmErpQuery = vi.mocked(confirmErpQuery);
const mockedExecuteErpQuery = vi.mocked(executeErpQuery);
const mockedSimulateErpQueryExecution = vi.mocked(simulateErpQueryExecution);
const mockedTrackEvent = vi.mocked(trackEvent);

beforeEach(() => {
  vi.clearAllMocks();
  mockedSimulateErpQueryExecution.mockResolvedValue(undefined);
});

const sampleQuery = {
  id: "query1",
  questionText: "上季各產品線的毛利率是多少?",
  createdAt: "2026-08-16T00:00:00.000Z",
};

describe("ErpQueryDetail (E09-S002)", () => {
  it("shows a loading state before the query resolves", () => {
    mockedGetErpQuery.mockReturnValue(new Promise(() => {}));

    render(<ErpQueryDetail id="query1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the question text once loaded", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: sampleQuery });

    render(<ErpQueryDetail id="query1" />);

    expect(await screen.findByRole("heading", { name: sampleQuery.questionText, level: 1 })).toBeInTheDocument();
  });

  it("shows a distinct error state when the query fails to load", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<ErpQueryDetail id="query1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入 ERP 查詢。");
  });

  it("shows a distinct not-found state when the query doesn't exist", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: null });

    render(<ErpQueryDetail id="query1" />);

    expect(await screen.findByText("找不到您要的內容。")).toBeInTheDocument();
  });

  it("shows a link back to the ERP assistant home", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: sampleQuery });

    render(<ErpQueryDetail id="query1" />);
    await screen.findByRole("heading", { name: sampleQuery.questionText, level: 1 });

    expect(screen.getByRole("link", { name: "返回 ERP 助手首頁" })).toHaveAttribute("href", "/erp");
  });
});

describe("ErpQueryDetail scenario selector (E09-S003)", () => {
  const matchingQuestionQuery = {
    id: "query2",
    questionText: "上個月各分公司的營收總額是多少?",
    createdAt: "2026-08-16T00:00:00.000Z",
  };

  it("shows the matched scenario(s) as selectable options when no scenario has been chosen yet", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: matchingQuestionQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: matchingQuestionQuery.questionText, level: 1 });

    for (const scenario of matchErpScenarios(matchingQuestionQuery.questionText)) {
      expect(screen.getByRole("button", { name: scenario.label })).toBeInTheDocument();
    }
  });

  it("falls back to every whitelisted scenario as options when nothing matches the question", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: sampleQuery });

    render(<ErpQueryDetail id="query1" />);
    await screen.findByRole("heading", { name: sampleQuery.questionText, level: 1 });

    for (const scenario of matchErpScenarios(sampleQuery.questionText)) {
      expect(screen.getByRole("button", { name: scenario.label })).toBeInTheDocument();
    }
  });

  it("selecting a scenario calls selectErpQueryScenario and then shows the selected label instead of the picker", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: matchingQuestionQuery });
    const scenario = matchErpScenarios(matchingQuestionQuery.questionText)[0]!;
    mockedSelectErpQueryScenario.mockResolvedValue({
      ok: true,
      value: { ...matchingQuestionQuery, selectedScenarioId: scenario.id },
    });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: matchingQuestionQuery.questionText, level: 1 });
    fireEvent.click(screen.getByRole("button", { name: scenario.label }));

    await waitFor(() => expect(mockedSelectErpQueryScenario).toHaveBeenCalledWith("query2", scenario.id));
    expect(await screen.findByText(`查詢情境:${scenario.label}`)).toBeInTheDocument();
    // Scoped to the picker's own scenario buttons (identified by label) —
    // not "zero buttons of any kind": E09-S005 "Query confirmation UI"
    // legitimately adds its own, differently-purposed 確認執行查詢 button
    // at exactly this point, which this assertion was never meant to
    // guard against. See erp-query-detail.tsx's own updated doc comment.
    for (const candidate of matchErpScenarios(matchingQuestionQuery.questionText)) {
      expect(screen.queryByRole("button", { name: candidate.label })).not.toBeInTheDocument();
    }
  });

  it("shows the already-selected scenario directly, with no picker, when the query already has one", async () => {
    const scenario = matchErpScenarios(matchingQuestionQuery.questionText)[0]!;
    mockedGetErpQuery.mockResolvedValue({
      ok: true,
      value: { ...matchingQuestionQuery, selectedScenarioId: scenario.id },
    });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: matchingQuestionQuery.questionText, level: 1 });

    expect(screen.getByText(`查詢情境:${scenario.label}`)).toBeInTheDocument();
    // Scoped the same way as the test above — see its own comment.
    for (const candidate of matchErpScenarios(matchingQuestionQuery.questionText)) {
      expect(screen.queryByRole("button", { name: candidate.label })).not.toBeInTheDocument();
    }
  });

  it("shows a distinct error alert when selecting a scenario fails, and keeps the picker visible", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: matchingQuestionQuery });
    const scenario = matchErpScenarios(matchingQuestionQuery.questionText)[0]!;
    mockedSelectErpQueryScenario.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: matchingQuestionQuery.questionText, level: 1 });
    fireEvent.click(screen.getByRole("button", { name: scenario.label }));

    expect(await screen.findByRole("alert")).toHaveTextContent("無法選擇查詢情境");
    expect(screen.getByRole("button", { name: scenario.label })).toBeInTheDocument();
  });
});

describe("ErpQueryDetail clarification wording (E09-S004)", () => {
  const matchingQuestionQuery = {
    id: "query2",
    questionText: "上個月各分公司的營收總額是多少?",
    createdAt: "2026-08-16T00:00:00.000Z",
  };

  it("shows the plain scenario prompt (not clarification wording) when the question confidently matched a scenario", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: matchingQuestionQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: matchingQuestionQuery.questionText, level: 1 });

    expect(screen.getByText("請選擇最符合您問題的查詢情境:")).toBeInTheDocument();
    expect(screen.queryByText(/無法確定您的問題屬於哪個查詢情境/)).not.toBeInTheDocument();
  });

  it("shows distinct clarification wording when the question matched no scenario (the S003 fallback case)", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: sampleQuery });

    render(<ErpQueryDetail id="query1" />);
    await screen.findByRole("heading", { name: sampleQuery.questionText, level: 1 });

    expect(screen.getByText(/無法確定您的問題屬於哪個查詢情境/)).toBeInTheDocument();
    expect(screen.queryByText("請選擇最符合您問題的查詢情境:")).not.toBeInTheDocument();
  });

  it("no longer shows clarification wording once a scenario has been selected", async () => {
    const scenario = matchErpScenarios(sampleQuery.questionText)[0]!;
    mockedGetErpQuery.mockResolvedValue({
      ok: true,
      value: { ...sampleQuery, selectedScenarioId: scenario.id },
    });

    render(<ErpQueryDetail id="query1" />);
    await screen.findByRole("heading", { name: sampleQuery.questionText, level: 1 });

    expect(screen.queryByText(/無法確定您的問題屬於哪個查詢情境/)).not.toBeInTheDocument();
  });
});

describe("ErpQueryDetail confirmation (E09-S005)", () => {
  const selectedQuery = {
    id: "query2",
    questionText: "上個月各分公司的營收總額是多少?",
    createdAt: "2026-08-16T00:00:00.000Z",
    selectedScenarioId: matchErpScenarios("上個月各分公司的營收總額是多少?")[0]!.id,
  };
  const scenarioLabel = matchErpScenarios(selectedQuery.questionText)[0]!.label;

  it("shows a confirm button once a scenario is selected but not yet confirmed", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: selectedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: selectedQuery.questionText, level: 1 });

    expect(screen.getByText(`查詢情境:${scenarioLabel}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確認執行查詢" })).toBeInTheDocument();
  });

  it("clicking confirm calls confirmErpQuery and then shows the loading state instead of the button (E09-S006 auto-triggers execution — see erp-query-detail.tsx's own updated doc comment)", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: selectedQuery });
    mockedConfirmErpQuery.mockResolvedValue({
      ok: true,
      value: { ...selectedQuery, confirmedAt: "2026-08-16T00:05:00.000Z" },
    });
    mockedExecuteErpQuery.mockReturnValue(new Promise(() => {}));

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: selectedQuery.questionText, level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "確認執行查詢" }));

    await waitFor(() => expect(mockedConfirmErpQuery).toHaveBeenCalledWith("query2"));
    expect(await screen.findByText("執行中…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "確認執行查詢" })).not.toBeInTheDocument();
  });

  it("shows a distinct error alert when confirming fails, and keeps the confirm button", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: selectedQuery });
    mockedConfirmErpQuery.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: selectedQuery.questionText, level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "確認執行查詢" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("無法確認查詢");
    expect(screen.getByRole("button", { name: "確認執行查詢" })).toBeInTheDocument();
  });
});

describe("ErpQueryDetail query execution (E09-S006)", () => {
  const confirmedQuery = {
    id: "query2",
    questionText: "上個月各分公司的營收總額是多少?",
    createdAt: "2026-08-16T00:00:00.000Z",
    selectedScenarioId: matchErpScenarios("上個月各分公司的營收總額是多少?")[0]!.id,
    confirmedAt: "2026-08-16T00:05:00.000Z",
  };

  it("automatically starts executing (no extra click) once a query is confirmed but not yet executed, showing a loading state", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: confirmedQuery });
    mockedExecuteErpQuery.mockReturnValue(new Promise(() => {}));

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: confirmedQuery.questionText, level: 1 });

    expect(await screen.findByText("執行中…")).toBeInTheDocument();
    await waitFor(() => expect(mockedSimulateErpQueryExecution).toHaveBeenCalled());
    await waitFor(() => expect(mockedExecuteErpQuery).toHaveBeenCalledWith("query2"));
  });

  it("shows an executed-done message once execution succeeds, with no loading text and no buttons left", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: confirmedQuery });
    mockedExecuteErpQuery.mockResolvedValue({
      ok: true,
      value: { ...confirmedQuery, executedAt: "2026-08-16T00:05:01.000Z" },
    });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: confirmedQuery.questionText, level: 1 });

    expect(await screen.findByText("查詢已執行完成。")).toBeInTheDocument();
    expect(screen.queryByText("執行中…")).not.toBeInTheDocument();
    expect(screen.getByRole("main").querySelectorAll("button")).toHaveLength(0);
  });

  it("does not re-trigger execution when the query is already executed", async () => {
    mockedGetErpQuery.mockResolvedValue({
      ok: true,
      value: { ...confirmedQuery, executedAt: "2026-08-16T00:05:01.000Z" },
    });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: confirmedQuery.questionText, level: 1 });
    await screen.findByText("查詢已執行完成。");

    expect(mockedSimulateErpQueryExecution).not.toHaveBeenCalled();
    expect(mockedExecuteErpQuery).not.toHaveBeenCalled();
  });

  it("shows a distinct error alert when execution fails, without claiming success", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: confirmedQuery });
    mockedExecuteErpQuery.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: confirmedQuery.questionText, level: 1 });

    expect(await screen.findByRole("alert")).toHaveTextContent("無法執行查詢");
    expect(screen.queryByText("查詢已執行完成。")).not.toBeInTheDocument();
  });

  it("emits attempt and success audit telemetry sharing the same correlation id, excluding the free-form question text", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: confirmedQuery });
    mockedExecuteErpQuery.mockResolvedValue({
      ok: true,
      value: { ...confirmedQuery, executedAt: "2026-08-16T00:05:01.000Z" },
    });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: confirmedQuery.questionText, level: 1 });
    await screen.findByText("查詢已執行完成。");

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "erp_query_execute_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "erp_query_execute_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attemptId = (attemptCall as [string, { correlationId: string }])[1].correlationId;
    const successId = (successCall as [string, { correlationId: string }])[1].correlationId;
    expect(attemptId).toBe(successId);

    for (const call of mockedTrackEvent.mock.calls) {
      const properties = (call as [string, { properties?: Record<string, unknown> }])[1]?.properties;
      expect(JSON.stringify(properties ?? {})).not.toContain(confirmedQuery.questionText);
    }
  });

  it("emits failure audit telemetry with the error code when execution fails", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: confirmedQuery });
    mockedExecuteErpQuery.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: confirmedQuery.questionText, level: 1 });
    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "erp_query_execute_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("ErpQueryDetail text summary (E09-S007)", () => {
  const executedQuery = {
    id: "query2",
    questionText: "上個月各分公司的營收總額是多少?",
    createdAt: "2026-08-16T00:00:00.000Z",
    selectedScenarioId: matchErpScenarios("上個月各分公司的營收總額是多少?")[0]!.id,
    confirmedAt: "2026-08-16T00:05:00.000Z",
    executedAt: "2026-08-16T00:05:01.000Z",
  };

  it("shows the scenario's own result summary alongside the existing 查詢已執行完成 status once executed", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });

    expect(await screen.findByText("查詢已執行完成。")).toBeInTheDocument();
    expect(screen.getByText(getErpResultSummary(executedQuery.selectedScenarioId))).toBeInTheDocument();
  });

  it("does not show any result summary before execution completes", async () => {
    mockedGetErpQuery.mockResolvedValue({
      ok: true,
      value: { ...executedQuery, executedAt: undefined },
    });
    mockedExecuteErpQuery.mockReturnValue(new Promise(() => {}));

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    await screen.findByText("執行中…");

    expect(screen.queryByText(getErpResultSummary(executedQuery.selectedScenarioId))).not.toBeInTheDocument();
  });
});
