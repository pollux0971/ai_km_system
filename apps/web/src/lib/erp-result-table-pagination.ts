import type { ErpResultTable } from "./erp-result-tables";

/**
 * E09-S009 "Server pagination UI". Client-side pagination over the
 * already-loaded mock table (getErpResultTable's own concern) — this
 * epic's "server" is fully simulated (see erp-execution.ts's own doc
 * comment), so there is no real paginated fetch to call; this presents
 * the same UI shape a genuine server-paginated result would have,
 * mirroring conversations.ts's own established vocabulary
 * (page/pageSize/totalPages) and prev/next-only nav (E03-S022's own
 * precedent, the only other pagination UI in this codebase — numbered
 * page links were explicitly rejected there in favor of the simplest UI
 * that fully covers "browse all pages").
 *
 * A small page size is a deliberate MVP choice, not an oversight: every
 * whitelisted scenario's mock table (3-5 rows) would otherwise fit on a
 * single page, leaving the pagination capability itself permanently
 * dormant and untestable in the real app — AC 8 allows simplifying the
 * algorithm, not leaving the capability effectively absent.
 */
export const ERP_RESULT_TABLE_PAGE_SIZE = 2;

export interface PaginatedErpResultTable {
  columns: string[];
  rows: string[][];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}

/**
 * Pure function: slices `table.rows` for the given page, clamping `page`
 * into `[1, totalPages]` the same lenient (not fail-closed) way
 * listConversations() clamps its own `page` parameter — an out-of-range
 * page number is a client bug, not a security-relevant input needing a
 * hard validation error.
 */
export function paginateErpResultTable(
  table: ErpResultTable,
  page: number,
  pageSize: number = ERP_RESULT_TABLE_PAGE_SIZE,
): PaginatedErpResultTable {
  const totalRows = table.rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = (clampedPage - 1) * pageSize;

  return {
    columns: table.columns,
    rows: table.rows.slice(start, start + pageSize),
    page: clampedPage,
    pageSize,
    totalRows,
    totalPages,
  };
}
