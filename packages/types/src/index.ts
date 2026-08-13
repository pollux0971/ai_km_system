/** Shared cross-team result/error shapes. Extend as real contracts land under contracts/openapi. */

export type Result<T, E = ApiError> = { ok: true; value: T } | { ok: false; error: E };

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
}
