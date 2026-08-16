import type { ApiError, Result } from "@ai-km/types";

/**
 * E09-S001 "ERP assistant home". An ERP query's recent-list summary —
 * same "fields deliberately minimal" discipline MaintenanceCaseSummary
 * (E07-S001) already established: `questionText` + `createdAt` is
 * everything a bare landing-page list needs to display. No `resultRows`/
 * `sqlPreview`/`scenario` field yet — those belong to their own later
 * stories (E09-S002 "Natural-language query composer" and neighbors),
 * same "don't invent a field ahead of the story that actually owns it"
 * discipline. `questionText` is the free-form natural-language question
 * that was asked, playing the same role `title` plays for a maintenance
 * case.
 *
 * The real ERP query engine (E09-S002 onward) and its E10 (Enterprise
 * Data Integration, Team B) backend don't exist yet — `contracts/` has
 * zero hits for erp/E10, and E10 is Team B's own separate epic. Per
 * SOURCE_BASELINE §5 pinned #35 and the identical E08/E07 precedent,
 * this file is a pure frontend mock, not a wait for E10.
 */
export interface ErpQuerySummary {
  id: string;
  questionText: string;
  createdAt: string;
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
