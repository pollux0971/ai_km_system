import type { ApiError, Result } from "@ai-km/types";
import { ERP_SCENARIO_OPTIONS } from "./erp-scenarios";

/**
 * E09-S001 "ERP assistant home". An ERP query's recent-list summary —
 * same "fields deliberately minimal" discipline MaintenanceCaseSummary
 * (E07-S001) already established: `questionText` + `createdAt` is
 * everything a bare landing-page list needs to display. No `resultRows`/
 * `sqlPreview` field yet — those belong to their own later stories
 * (E09-S007 onward), same "don't invent a field ahead of the story that
 * actually owns it" discipline. `questionText` is the free-form
 * natural-language question that was asked, playing the same role
 * `title` plays for a maintenance case.
 *
 * `selectedScenarioId` (E09-S003 "Query scenario selector") is optional
 * — absent until the user picks one of the ERP_SCENARIO_OPTIONS
 * candidates matchErpScenarios() surfaces for this query's own
 * questionText, same "field absence means not-yet-set" precedent
 * MaintenanceCaseSummary's own equipmentId/serialNumber/errorCode
 * already establish.
 *
 * `confirmedAt` (E09-S005 "Query confirmation UI") is optional the same
 * way — absent until the user explicitly confirms a query that already
 * has a `selectedScenarioId`. A timestamp rather than a boolean, same
 * "store when, not just whether" precedent `createdAt` itself already
 * sets for this same interface.
 *
 * `executedAt` (E09-S006 "Query loading state") is optional the same
 * way again — absent until executeErpQuery() completes for an already-
 * confirmed query. This is the first field in this file whose owning
 * mutation genuinely triggers SOURCE_BASELINE pinned #22's audit
 * requirement (see executeErpQuery's own doc comment) — S002/S003/S005
 * all judged their own equivalent AC as N/A because nothing before this
 * point actually touches ERP data, even in simulated form.
 *
 * The real ERP query engine and its E10 (Enterprise Data Integration,
 * Team B) backend don't exist yet — `contracts/` has zero hits for
 * erp/E10, and E10 is Team B's own separate epic. Per SOURCE_BASELINE
 * §5 pinned #35 and the identical E08/E07 precedent, this file is a
 * pure frontend mock, not a wait for E10.
 */
export interface ErpQuerySummary {
  id: string;
  questionText: string;
  createdAt: string;
  selectedScenarioId?: string;
  confirmedAt?: string;
  executedAt?: string;
}

/**
 * Seed data: 3 sample queries, same "a handful of realistic, varied
 * examples" precedent SAMPLE_MAINTENANCE_CASES/SAMPLE_KNOWLEDGE_BASES
 * already established, not an empty or single-item fixture — a
 * genuinely empty list is exercised by a dedicated component test with
 * a mocked empty response instead, same as ErpQueryList's own "尚無
 * ERP 查詢紀錄。" test does. Phrased as the kind of natural-language
 * question a sales_purchasing user would ask (SOURCE_BASELINE's own
 * role description for this nav entry).
 */
const SAMPLE_ERP_QUERIES: ErpQuerySummary[] = [
  {
    id: "erp-query-sample-1",
    questionText: "上個月各分公司的營收總額是多少?",
    createdAt: "2026-08-14T09:00:00.000Z",
  },
  {
    id: "erp-query-sample-2",
    questionText: "目前庫存低於安全存量的品項有哪些?",
    createdAt: "2026-08-13T14:20:00.000Z",
  },
  {
    id: "erp-query-sample-3",
    questionText: "本季應收帳款逾期客戶清單",
    createdAt: "2026-08-11T10:45:00.000Z",
  },
];

const STORAGE_KEY = "ai-km:mock-erp-queries";

/** Same sessionStorage-backed reasoning as lib/maintenance-cases.ts's own readStore(). */
function readStore(): ErpQuerySummary[] {
  if (typeof window === "undefined") return SAMPLE_ERP_QUERIES;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return SAMPLE_ERP_QUERIES;
  try {
    return JSON.parse(raw) as ErpQuerySummary[];
  } catch {
    return SAMPLE_ERP_QUERIES;
  }
}

/** E09-S002 "Natural-language query composer". First writeStore() caller — S001 (list-only) deliberately left it out. */
function writeStore(items: ErpQuerySummary[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * All ERP queries, most-recently-created first — same "list needs an
 * explicit, deterministic order, not insertion order" reasoning as
 * listMaintenanceCases' own sort.
 */
export async function listErpQueries(): Promise<Result<ErpQuerySummary[], ApiError>> {
  return {
    ok: true,
    value: [...readStore()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

/**
 * E09-S002. First single-item lookup this file exports — same
 * `value: T | null` (not a rejected Promise or a NOT_FOUND error) shape
 * getMaintenanceCase already establishes for "the fetch itself
 * succeeded; the id just doesn't resolve to anything", leaving the
 * NOT_FOUND-vs-error distinction to the caller.
 */
export async function getErpQuery(id: string): Promise<Result<ErpQuerySummary | null, ApiError>> {
  return { ok: true, value: readStore().find((item) => item.id === id) ?? null };
}

/**
 * E09-S002 "Natural-language query composer". Creates a new query from
 * the user's typed natural-language question. Rejects an empty or
 * whitespace-only question with VALIDATION_ERROR — same server-
 * validates-too discipline as createMaintenanceCase, even though the
 * composer's own submit button is already disabled until non-whitespace
 * text is entered. Fails closed rather than trusting a bypassed client.
 *
 * `questionText` is trimmed before storing — same "store the
 * user's intent, not incidental whitespace" precedent createKnowledgeBase
 * already establishes for `name`.
 */
export async function submitErpQuery(questionText: string): Promise<Result<ErpQuerySummary, ApiError>> {
  const trimmed = questionText.trim();
  if (!trimmed) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請輸入您的問題。" } };
  }

  const query: ErpQuerySummary = {
    id: crypto.randomUUID(),
    questionText: trimmed,
    createdAt: new Date().toISOString(),
  };
  writeStore([...readStore(), query]);
  return { ok: true, value: query };
}

/**
 * E09-S003 "Query scenario selector". Records which whitelisted scenario
 * the user picked for an already-submitted query. Fails closed with
 * NOT_FOUND for an unknown query id (same shape createMaintenanceCase's
 * sibling mutations use for a missing parent, not a `value: null` —
 * this is a write, not a lookup) and VALIDATION_ERROR for a scenarioId
 * outside ERP_SCENARIO_OPTIONS, even though the picker UI only ever
 * offers real options — same "server validates too, don't trust a
 * bypassed client" discipline createMaintenanceCase's own equipmentId
 * check already establishes.
 */
export async function selectErpQueryScenario(id: string, scenarioId: string): Promise<Result<ErpQuerySummary, ApiError>> {
  const store = readStore();
  const query = store.find((item) => item.id === id);
  if (!query) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個 ERP 查詢。" } };
  }

  if (!ERP_SCENARIO_OPTIONS.some((option) => option.id === scenarioId)) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請選擇有效的查詢情境。" } };
  }

  const updated: ErpQuerySummary = { ...query, selectedScenarioId: scenarioId };
  writeStore(store.map((item) => (item.id === id ? updated : item)));
  return { ok: true, value: updated };
}

/**
 * E09-S005 "Query confirmation UI". Records the user's explicit
 * confirmation that a query (with a scenario already selected) is ready
 * to run — the gate E09-S006 "Query loading state" will check before
 * actually starting execution. Fails closed with NOT_FOUND for an
 * unknown query id (same shape selectErpQueryScenario already uses) and
 * VALIDATION_ERROR when no scenario has been selected yet, even though
 * the confirm button only ever renders after selection — same
 * server-validates-too discipline every sibling mutation in this file
 * already follows.
 */
export async function confirmErpQuery(id: string): Promise<Result<ErpQuerySummary, ApiError>> {
  const store = readStore();
  const query = store.find((item) => item.id === id);
  if (!query) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個 ERP 查詢。" } };
  }

  if (!query.selectedScenarioId) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請先選擇查詢情境。" } };
  }

  const updated: ErpQuerySummary = { ...query, confirmedAt: new Date().toISOString() };
  writeStore(store.map((item) => (item.id === id ? updated : item)));
  return { ok: true, value: updated };
}

/**
 * E09-S006 "Query loading state". Records that a confirmed query has
 * actually run (in this MVP: a simulated, always-successful mock, not a
 * real SELECT against a whitelisted view — see erp-execution.ts's own
 * doc comment for the timing primitive this is paired with). Fails
 * closed with NOT_FOUND for an unknown query id and VALIDATION_ERROR
 * when the query has not been confirmed yet, same shape and
 * server-validates-too discipline every sibling mutation in this file
 * already follows.
 *
 * This is the first mutation in this file whose caller genuinely needs
 * a real audit event rather than judging AC7 N/A — see
 * erp-query-detail.tsx's own updated doc comment for where that
 * trackEvent call actually lives (the component, not here: this
 * function only owns the data mutation itself, same "mutation and
 * telemetry are the caller's job, not the lib function's" separation
 * every other mutation in this file already keeps).
 */
export async function executeErpQuery(id: string): Promise<Result<ErpQuerySummary, ApiError>> {
  const store = readStore();
  const query = store.find((item) => item.id === id);
  if (!query) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個 ERP 查詢。" } };
  }

  if (!query.confirmedAt) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請先確認查詢。" } };
  }

  const updated: ErpQuerySummary = { ...query, executedAt: new Date().toISOString() };
  writeStore(store.map((item) => (item.id === id ? updated : item)));
  return { ok: true, value: updated };
}
