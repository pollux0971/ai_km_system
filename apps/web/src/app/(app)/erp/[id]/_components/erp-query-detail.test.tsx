import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ErpQueryDetail from "./erp-query-detail";
import { confirmErpQuery, executeErpQuery, getErpQuery, selectErpQueryScenario } from "@/lib/erp-queries";
import { matchErpScenarios } from "@/lib/erp-scenarios";
import { simulateErpQueryExecution } from "@/lib/erp-execution";
import { simulateErpExportProgress } from "@/lib/erp-export-progress";
import { getErpResultSummary } from "@/lib/erp-results";
import { getErpResultTable } from "@/lib/erp-result-tables";
import { paginateErpResultTable } from "@/lib/erp-result-table-pagination";
import { getErpResultKpi } from "@/lib/erp-result-kpis";
import { getErpResultChart } from "@/lib/erp-result-charts";
import { getAppliedFilterLabel } from "@/lib/erp-applied-filters";
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

vi.mock("@/lib/erp-export-progress", () => ({
  simulateErpExportProgress: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedGetErpQuery = vi.mocked(getErpQuery);
const mockedSelectErpQueryScenario = vi.mocked(selectErpQueryScenario);
const mockedConfirmErpQuery = vi.mocked(confirmErpQuery);
const mockedExecuteErpQuery = vi.mocked(executeErpQuery);
const mockedSimulateErpQueryExecution = vi.mocked(simulateErpQueryExecution);
const mockedSimulateErpExportProgress = vi.mocked(simulateErpExportProgress);
const mockedTrackEvent = vi.mocked(trackEvent);

// E09-S017: the export flow triggers a real download via a programmatic,
// detached <a download>.click() (see erp-query-detail.tsx's own doc
// comment) rather than a standing, DOM-inspectable link — intercepting
// HTMLAnchorElement.prototype.click captures the anchor at the moment of
// the (attempted) download so its href/download attributes can still be
// asserted directly, without needing jsdom to implement real navigation.
const clickedAnchors: HTMLAnchorElement[] = [];
vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
  clickedAnchors.push(this);
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedSimulateErpQueryExecution.mockResolvedValue(undefined);
  mockedSimulateErpExportProgress.mockResolvedValue(undefined);
  clickedAnchors.length = 0;
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

  it("shows an executed-done message once execution succeeds, with no loading text and no leftover process-driving buttons", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: confirmedQuery });
    mockedExecuteErpQuery.mockResolvedValue({
      ok: true,
      value: { ...confirmedQuery, executedAt: "2026-08-16T00:05:01.000Z" },
    });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: confirmedQuery.questionText, level: 1 });

    expect(await screen.findByText("查詢已執行完成。")).toBeInTheDocument();
    expect(screen.queryByText("執行中…")).not.toBeInTheDocument();

    // E09-S009 "Server pagination UI" legitimately adds its own nav
    // buttons (上一頁/下一頁), and E09-S016/S017 "Excel export action"/
    // "Export progress" legitimately adds its own 匯出 Excel button, at
    // this exact resting state — different kinds of control (browsing an
    // already-complete result; exporting it) from what this test actually
    // guards against (no leftover confirm/retry-style button that would
    // still be driving the query process forward). Scoped past both
    // rather than the original blanket "zero buttons anywhere" check,
    // same narrowing category as S003's own scenario-picker assertion
    // narrowed for S005.
    const paginationNav = screen.queryByRole("navigation", { name: "查詢結果分頁" });
    const exportButton = screen.queryByRole("button", { name: "匯出 Excel" });
    const buttonsOutsideNav = Array.from(screen.getByRole("main").querySelectorAll("button")).filter(
      (button) => !paginationNav?.contains(button) && button !== exportButton,
    );
    expect(buttonsOutsideNav).toHaveLength(0);
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

describe("ErpQueryDetail result table (E09-S008)", () => {
  const executedQuery = {
    id: "query2",
    questionText: "上個月各分公司的營收總額是多少?",
    createdAt: "2026-08-16T00:00:00.000Z",
    selectedScenarioId: matchErpScenarios("上個月各分公司的營收總額是多少?")[0]!.id,
    confirmedAt: "2026-08-16T00:05:00.000Z",
    executedAt: "2026-08-16T00:05:01.000Z",
  };

  it("shows the scenario's own result table (every column header, and page 1's own cells) once executed", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    await screen.findByText(getErpResultSummary(executedQuery.selectedScenarioId));

    // E09-S009 "Server pagination UI" narrows this to page 1's own cells —
    // not every row is on screen at once once a table spans more than one
    // page. Full multi-page coverage lives in its own describe block below.
    const table = getErpResultTable(executedQuery.selectedScenarioId);
    const page1 = paginateErpResultTable(table, 1);
    expect(screen.getByRole("table")).toBeInTheDocument();
    for (const column of table.columns) {
      expect(screen.getByRole("columnheader", { name: column })).toBeInTheDocument();
    }
    for (const row of page1.rows) {
      for (const cell of row) {
        expect(screen.getByRole("cell", { name: cell })).toBeInTheDocument();
      }
    }
  });

  it("does not show any result table before execution completes", async () => {
    mockedGetErpQuery.mockResolvedValue({
      ok: true,
      value: { ...executedQuery, executedAt: undefined },
    });
    mockedExecuteErpQuery.mockReturnValue(new Promise(() => {}));

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    await screen.findByText("執行中…");

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("ErpQueryDetail result table pagination (E09-S009)", () => {
  const executedQuery = {
    id: "query2",
    questionText: "上個月各分公司的營收總額是多少?",
    createdAt: "2026-08-16T00:00:00.000Z",
    selectedScenarioId: matchErpScenarios("上個月各分公司的營收總額是多少?")[0]!.id,
    confirmedAt: "2026-08-16T00:05:00.000Z",
    executedAt: "2026-08-16T00:05:01.000Z",
  };
  const table = getErpResultTable(executedQuery.selectedScenarioId); // revenue-by-branch, 3 rows

  it("shows a pagination nav with the correct page indicator once executed", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });

    expect(await screen.findByRole("navigation", { name: "查詢結果分頁" })).toBeInTheDocument();
    const { totalPages } = paginateErpResultTable(table, 1);
    expect(screen.getByText(`第 1 頁，共 ${totalPages} 頁`)).toBeInTheDocument();
  });

  it("the previous-page button is disabled on page 1", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });

    expect(await screen.findByRole("button", { name: "上一頁" })).toBeDisabled();
  });

  it("clicking 下一頁 reveals the next page's rows and hides the previous page's own rows", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    await screen.findByRole("table");

    expect(screen.getByRole("cell", { name: "台北" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "高雄" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一頁" }));

    expect(await screen.findByRole("cell", { name: "高雄" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "台北" })).not.toBeInTheDocument();
  });

  it("下一頁 becomes disabled on the last page, and 上一頁 becomes enabled", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("button", { name: "下一頁" }));
    await screen.findByRole("cell", { name: "高雄" });

    expect(screen.getByRole("button", { name: "下一頁" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "上一頁" })).toBeEnabled();
  });

  it("does not show any pagination nav before execution completes", async () => {
    mockedGetErpQuery.mockResolvedValue({
      ok: true,
      value: { ...executedQuery, executedAt: undefined },
    });
    mockedExecuteErpQuery.mockReturnValue(new Promise(() => {}));

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    await screen.findByText("執行中…");

    expect(screen.queryByRole("navigation", { name: "查詢結果分頁" })).not.toBeInTheDocument();
  });
});

describe("ErpQueryDetail KPI card (E09-S010)", () => {
  const executedQuery = {
    id: "query2",
    questionText: "上個月各分公司的營收總額是多少?",
    createdAt: "2026-08-16T00:00:00.000Z",
    selectedScenarioId: matchErpScenarios("上個月各分公司的營收總額是多少?")[0]!.id,
    confirmedAt: "2026-08-16T00:05:00.000Z",
    executedAt: "2026-08-16T00:05:01.000Z",
  };

  it("shows the scenario's own KPI card (label and value) once executed", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });

    const kpi = getErpResultKpi(executedQuery.selectedScenarioId);
    expect(await screen.findByRole("group", { name: "關鍵指標" })).toBeInTheDocument();
    expect(screen.getByText(kpi.label)).toBeInTheDocument();
    expect(screen.getByText(String(kpi.value))).toBeInTheDocument();
  });

  it("does not show any KPI card before execution completes", async () => {
    mockedGetErpQuery.mockResolvedValue({
      ok: true,
      value: { ...executedQuery, executedAt: undefined },
    });
    mockedExecuteErpQuery.mockReturnValue(new Promise(() => {}));

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    await screen.findByText("執行中…");

    expect(screen.queryByRole("group", { name: "關鍵指標" })).not.toBeInTheDocument();
  });

  it("the KPI value reflects the full result count, not just the current page", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    await screen.findByRole("table");

    const kpi = getErpResultKpi(executedQuery.selectedScenarioId);
    expect(screen.getByText(String(kpi.value))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一頁" }));
    await screen.findByText("第 2 頁，共 2 頁");

    // Still the full count, unchanged by paging — a KPI reflecting only
    // the current page's row count would be a real bug this guards
    // against.
    expect(screen.getByText(String(kpi.value))).toBeInTheDocument();
  });
});

describe("ErpQueryDetail chart (E09-S011)", () => {
  const executedQuery = {
    id: "query2",
    questionText: "上個月各分公司的營收總額是多少?",
    createdAt: "2026-08-16T00:00:00.000Z",
    selectedScenarioId: matchErpScenarios("上個月各分公司的營收總額是多少?")[0]!.id,
    confirmedAt: "2026-08-16T00:05:00.000Z",
    executedAt: "2026-08-16T00:05:01.000Z",
  };

  it("shows the scenario's own chart (one bar per row, with correct labels and details) once executed", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });

    const chart = getErpResultChart(executedQuery.selectedScenarioId);
    const chartGroup = await screen.findByRole("group", { name: "結果圖表" });
    // Scoped to the chart's own container — bar labels/details (e.g. 台北)
    // legitimately repeat text already shown in the table above, so an
    // unscoped query would be ambiguous.
    for (const bar of chart.bars) {
      expect(within(chartGroup).getByText(bar.label)).toBeInTheDocument();
      expect(within(chartGroup).getByText(bar.detail)).toBeInTheDocument();
    }
  });

  it("renders each bar's visual width proportional to its own computed widthPercent", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });

    const chart = getErpResultChart(executedQuery.selectedScenarioId);
    const chartGroup = await screen.findByRole("group", { name: "結果圖表" });
    // The chart's whole point is comparing values by bar length — a
    // component-level regression that silently stopped wiring
    // widthPercent into the rendered style (while still rendering the
    // right label/detail text) would defeat that purpose without any
    // other test in this file catching it.
    for (const bar of chart.bars) {
      const barRow = within(chartGroup).getByText(bar.label).parentElement;
      const widthBar = barRow?.querySelector("div");
      expect(widthBar).toHaveStyle({ width: `${bar.widthPercent}%` });
    }
  });

  it("does not show any chart before execution completes", async () => {
    mockedGetErpQuery.mockResolvedValue({
      ok: true,
      value: { ...executedQuery, executedAt: undefined },
    });
    mockedExecuteErpQuery.mockReturnValue(new Promise(() => {}));

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    await screen.findByText("執行中…");

    expect(screen.queryByRole("group", { name: "結果圖表" })).not.toBeInTheDocument();
  });
});

describe("ErpQueryDetail applied-filter display (E09-S012)", () => {
  const matchingQuestionQuery = {
    id: "query2",
    questionText: "上個月各分公司的營收總額是多少?",
    createdAt: "2026-08-16T00:00:00.000Z",
  };

  it("shows the applied-filter label as soon as a scenario is selected, before confirmation", async () => {
    const scenario = matchErpScenarios(matchingQuestionQuery.questionText)[0]!;
    mockedGetErpQuery.mockResolvedValue({
      ok: true,
      value: { ...matchingQuestionQuery, selectedScenarioId: scenario.id },
    });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: matchingQuestionQuery.questionText, level: 1 });

    const label = getAppliedFilterLabel(scenario.id, matchingQuestionQuery.questionText);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("still shows the applied-filter label once execution completes", async () => {
    const scenario = matchErpScenarios(matchingQuestionQuery.questionText)[0]!;
    mockedGetErpQuery.mockResolvedValue({
      ok: true,
      value: {
        ...matchingQuestionQuery,
        selectedScenarioId: scenario.id,
        confirmedAt: "2026-08-16T00:05:00.000Z",
        executedAt: "2026-08-16T00:05:01.000Z",
      },
    });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: matchingQuestionQuery.questionText, level: 1 });

    const label = getAppliedFilterLabel(scenario.id, matchingQuestionQuery.questionText);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("does not show any applied-filter label before a scenario has been selected", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: matchingQuestionQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: matchingQuestionQuery.questionText, level: 1 });

    for (const scenario of matchErpScenarios(matchingQuestionQuery.questionText)) {
      const label = getAppliedFilterLabel(scenario.id, matchingQuestionQuery.questionText);
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});

describe("ErpQueryDetail data freshness badge (E09-S013)", () => {
  const executedQuery = {
    id: "query2",
    questionText: "上個月各分公司的營收總額是多少?",
    createdAt: "2026-08-16T00:00:00.000Z",
    selectedScenarioId: matchErpScenarios("上個月各分公司的營收總額是多少?")[0]!.id,
    confirmedAt: "2026-08-16T00:05:00.000Z",
    executedAt: "2026-08-16T00:05:01.000Z",
  };

  it("shows the data freshness badge with the execution timestamp once executed", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });

    // toLocaleString("zh-TW") inserts a U+2009 thin space before 上午/下午
    // — normalized the same way Testing Library's own default normalizer
    // collapses DOM whitespace, so both sides of the comparison agree.
    const formattedExecutedAt = new Date(executedQuery.executedAt).toLocaleString("zh-TW").replace(/\s+/g, " ");
    expect(await screen.findByText(formattedExecutedAt)).toBeInTheDocument();
    expect(screen.getByText(formattedExecutedAt).closest("time")).toHaveAttribute("dateTime", executedQuery.executedAt);
  });

  it("does not show any data freshness badge before execution completes", async () => {
    mockedGetErpQuery.mockResolvedValue({
      ok: true,
      value: { ...executedQuery, executedAt: undefined },
    });
    mockedExecuteErpQuery.mockReturnValue(new Promise(() => {}));

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    await screen.findByText("執行中…");

    // toLocaleString("zh-TW") inserts a U+2009 thin space before 上午/下午
    // — normalized the same way Testing Library's own default normalizer
    // collapses DOM whitespace, so both sides of the comparison agree.
    const formattedExecutedAt = new Date(executedQuery.executedAt).toLocaleString("zh-TW").replace(/\s+/g, " ");
    expect(screen.queryByText(formattedExecutedAt)).not.toBeInTheDocument();
  });
});

describe("ErpQueryDetail source-system badge (E09-S014)", () => {
  const executedQuery = {
    id: "query2",
    questionText: "上個月各分公司的營收總額是多少?",
    createdAt: "2026-08-16T00:00:00.000Z",
    selectedScenarioId: matchErpScenarios("上個月各分公司的營收總額是多少?")[0]!.id,
    confirmedAt: "2026-08-16T00:05:00.000Z",
    executedAt: "2026-08-16T00:05:01.000Z",
  };
  const sourceSystemLabel = "資料來源系統：模擬 ERP 系統(MVP,唯讀)";

  it("shows the source-system badge once executed", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });

    expect(await screen.findByText(sourceSystemLabel)).toBeInTheDocument();
  });

  it("shows the identical source-system badge for every whitelisted scenario — this MVP has exactly one (simulated) ERP data source", async () => {
    for (const scenario of matchErpScenarios(executedQuery.questionText)) {
      mockedGetErpQuery.mockResolvedValue({ ok: true, value: { ...executedQuery, selectedScenarioId: scenario.id } });

      const { unmount } = render(<ErpQueryDetail id="query2" />);
      await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });

      expect(screen.getByText(sourceSystemLabel)).toBeInTheDocument();
      unmount();
    }
  });

  it("does not show any source-system badge before execution completes", async () => {
    mockedGetErpQuery.mockResolvedValue({
      ok: true,
      value: { ...executedQuery, executedAt: undefined },
    });
    mockedExecuteErpQuery.mockReturnValue(new Promise(() => {}));

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    await screen.findByText("執行中…");

    expect(screen.queryByText(sourceSystemLabel)).not.toBeInTheDocument();
  });
});

describe("ErpQueryDetail Excel export action (E09-S016, E09-S017 progress)", () => {
  const executedQuery = {
    id: "query2",
    questionText: "上個月各分公司的營收總額是多少?",
    createdAt: "2026-08-16T00:00:00.000Z",
    selectedScenarioId: matchErpScenarios("上個月各分公司的營收總額是多少?")[0]!.id,
    confirmedAt: "2026-08-16T00:05:00.000Z",
    executedAt: "2026-08-16T00:05:01.000Z",
  };

  function decodeCsvHrefRaw(href: string): string {
    expect(href.startsWith("data:text/csv;charset=utf-8,")).toBe(true);
    return decodeURIComponent(href.replace("data:text/csv;charset=utf-8,", ""));
  }

  // Strips the leading BOM after its own presence is verified separately
  // below — a bare strip-without-asserting here would make this helper
  // silently tolerate a regression that drops the BOM entirely (a mutation
  // test confirmed exactly that: removing the BOM left every other test in
  // this block still green, since none of them checked for it directly).
  function decodeCsvHref(href: string): string {
    return decodeCsvHrefRaw(href).replace(/^﻿/, "");
  }

  it("shows a 匯出 Excel button once executed", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });

    expect(await screen.findByRole("button", { name: "匯出 Excel" })).toBeInTheDocument();
  });

  it("does not show any export button before execution completes", async () => {
    mockedGetErpQuery.mockResolvedValue({
      ok: true,
      value: { ...executedQuery, executedAt: undefined },
    });
    mockedExecuteErpQuery.mockReturnValue(new Promise(() => {}));

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    await screen.findByText("執行中…");

    expect(screen.queryByRole("button", { name: "匯出 Excel" })).not.toBeInTheDocument();
  });

  // E09-S017 "Export progress" — S016's own generation was instant
  // (synchronous, in-memory), so clicking the button used to download
  // immediately with no observable in-between state. This story adds a
  // simulated delay (erp-export-progress.ts, same shape as
  // erp-execution.ts's own execution delay) with a distinct 匯出中…
  // state shown while it runs, same auto-transition shape S006 already
  // established for query execution (no extra click needed once started).
  it("E09-S017: shows a 匯出中… progress state while exporting, hiding the button", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });
    mockedSimulateErpExportProgress.mockReturnValue(new Promise(() => {}));

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    fireEvent.click(await screen.findByRole("button", { name: "匯出 Excel" }));

    expect(await screen.findByText("匯出中…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "匯出 Excel" })).not.toBeInTheDocument();
  });

  it("E09-S017: returns to the 匯出 Excel button once the simulated export progress completes", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    fireEvent.click(await screen.findByRole("button", { name: "匯出 Excel" }));

    await waitFor(() => expect(clickedAnchors).toHaveLength(1));
    expect(await screen.findByRole("button", { name: "匯出 Excel" })).toBeInTheDocument();
    expect(screen.queryByText("匯出中…")).not.toBeInTheDocument();
  });

  // The download itself is triggered via a programmatic, detached
  // <a download>.click() (see erp-query-detail.tsx's own doc comment for
  // why — S016's original standing, DOM-inspectable <a> can't represent a
  // "pending" state) — HTMLAnchorElement.prototype.click is intercepted
  // above so the anchor's own href/download attributes are still directly
  // assertable, same content the original S016 tests already checked.
  it("downloads a CSV file (correct filename, BOM-prefixed, full table content) once the export completes", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    // Still on page 1 — 高雄 isn't rendered in the table yet (E09-S009),
    // but the export must include it regardless: an export is expected to
    // hold the whole result set, not just whatever page happens to be on
    // screen.
    expect(screen.queryByRole("cell", { name: "高雄" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "匯出 Excel" }));

    await waitFor(() => expect(clickedAnchors).toHaveLength(1));
    const anchor = clickedAnchors[0]!;
    expect(anchor.download).toBe("erp-query-result.csv");
    const rawCsv = decodeCsvHrefRaw(anchor.href);
    expect(rawCsv.startsWith("﻿")).toBe(true);
    const csv = decodeCsvHref(anchor.href);
    const table = getErpResultTable(executedQuery.selectedScenarioId);
    for (const row of table.rows) {
      for (const cell of row) {
        expect(csv).toContain(cell);
      }
    }
  });

  // Renamed from S016's single erp_query_export (fired once, synchronously,
  // on click) to an attempt/success pair sharing a correlation id — the
  // same shape erp_query_execute_attempt/_success already use in this same
  // file — now that there's a genuine start and end to the operation
  // instead of one instantaneous action.
  it("clicking export fires erp_query_export_attempt then erp_query_export_success telemetry sharing a correlation id, with the scenario id and row count, excluding the free-form question text", async () => {
    mockedGetErpQuery.mockResolvedValue({ ok: true, value: executedQuery });

    render(<ErpQueryDetail id="query2" />);
    await screen.findByRole("heading", { name: executedQuery.questionText, level: 1 });
    fireEvent.click(await screen.findByRole("button", { name: "匯出 Excel" }));

    await waitFor(() => expect(clickedAnchors).toHaveLength(1));

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "erp_query_export_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "erp_query_export_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attemptOptions = (attemptCall as [string, { correlationId: string; properties: Record<string, unknown> }])[1];
    const successOptions = (successCall as [string, { correlationId: string; properties: Record<string, unknown> }])[1];
    expect(attemptOptions.correlationId).toBe(successOptions.correlationId);
    expect(successOptions.properties).toEqual({
      erpQueryId: "query2",
      scenarioId: executedQuery.selectedScenarioId,
      rowCount: getErpResultTable(executedQuery.selectedScenarioId).rows.length,
    });
    for (const call of [attemptCall, successCall]) {
      const properties = (call as [string, { properties?: Record<string, unknown> }])[1]?.properties;
      expect(JSON.stringify(properties ?? {})).not.toContain(executedQuery.questionText);
    }
  });
});
