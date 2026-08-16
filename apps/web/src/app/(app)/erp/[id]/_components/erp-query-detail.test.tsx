import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ErpQueryDetail from "./erp-query-detail";
import { getErpQuery, selectErpQueryScenario } from "@/lib/erp-queries";
import { matchErpScenarios } from "@/lib/erp-scenarios";

vi.mock("@/lib/erp-queries", () => ({
  getErpQuery: vi.fn(),
  selectErpQueryScenario: vi.fn(),
}));

const mockedGetErpQuery = vi.mocked(getErpQuery);
const mockedSelectErpQueryScenario = vi.mocked(selectErpQueryScenario);

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
    expect(screen.queryAllByRole("button")).toHaveLength(0);
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
    expect(screen.queryAllByRole("button")).toHaveLength(0);
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
