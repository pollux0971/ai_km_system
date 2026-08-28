import { toResult } from "@ai-km/api-client";
import type { ApiError, Result } from "@ai-km/types";
import { apiClient } from "./api";

/**
 * E11-S016 "Feedback queue" / E13-S008 "Feedback detail view" / E13-S021
 * "接真實 API". `FeedbackItem` now mirrors `contracts/openapi/analytics.yaml`
 * `FeedbackItem` field-for-field — `messageId`/`conversationId`/
 * `answerExcerpt` are additions (E13-S021), everything else (`id`, `verdict`,
 * `reason?`, `comment?`, `citationFeedback?`, `submittedAt`) is unchanged
 * from the shape E11-S016/E13-S004/E13-S005 already established. `id` and
 * `messageId` happen to carry the same value server-side (E13-S019's own
 * EVIDENCE: a message has at most one feedback record, so there is no
 * second id space) — both fields are kept because the contract declares
 * both as required, not because this type invents a distinction the
 * server doesn't have.
 */
export interface FeedbackItem {
  id: string;
  verdict: "ok" | "ng";
  reason?: string;
  comment?: string;
  citationFeedback?: { citationId: string; verdict: "ok" | "ng" }[];
  submittedAt: string;
  messageId: string;
  conversationId: string;
  answerExcerpt: string;
}

export interface FeedbackPage {
  items: FeedbackItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ListFeedbackOptions {
  verdict?: FeedbackItem["verdict"];
  hasReason?: boolean;
  page?: number;
  pageSize?: number;
}

/**
 * E13-S021: `verdict`/`hasReason` are now sent as real query parameters to
 * `GET /admin/feedback` — the server does the filtering, not
 * `filterFeedback` below (which stays exported and tested as a pure
 * function, per the story's own technical decision, but is no longer
 * called from `feedback-list.tsx`). This is the "移除 client 篩選" branch
 * of that decision, not the "second-guess the server" one: a paged
 * response only ever contains one page's worth of items, so re-filtering
 * client-side would silently show fewer than a page even when more
 * matches exist on other pages.
 */
export async function listFeedback(options: ListFeedbackOptions = {}): Promise<Result<FeedbackPage, ApiError>> {
  // Conditional spread, not `field: options.field` — an explicit `undefined`
  // value still serializes onto the query string (as the literal string
  // "undefined") rather than being omitted, same reasoning
  // `listConversations` (apps/web/src/lib/conversations.ts) already
  // establishes for its own optional `q` parameter.
  return toResult(
    apiClient.analytics.GET("/admin/feedback", {
      params: {
        query: {
          ...(options.verdict !== undefined ? { verdict: options.verdict } : {}),
          ...(options.hasReason !== undefined ? { hasReason: options.hasReason } : {}),
          ...(options.page !== undefined ? { page: options.page } : {}),
          ...(options.pageSize !== undefined ? { pageSize: options.pageSize } : {}),
        },
      },
    }),
  );
}

export async function getFeedback(id: string): Promise<Result<FeedbackItem | null, ApiError>> {
  const result = await toResult(
    apiClient.analytics.GET("/admin/feedback/{messageId}", { params: { path: { messageId: id } } }),
  );
  if (result.ok) return result;
  if (result.error.code === "NOT_FOUND") return { ok: true, value: null };
  return result;
}

/**
 * E13-S007 "feedback queue filter". Pure narrowing function — kept exactly
 * as E13-S007 wrote it (still unit-tested against fixture data below), but
 * no longer called from `feedback-list.tsx` as of E13-S021: filtering now
 * happens server-side via `listFeedback`'s `verdict`/`hasReason` query
 * params (see that function's own doc comment for why).
 */
export interface FeedbackFilterCriteria {
  verdict?: FeedbackItem["verdict"];
  hasReason?: boolean;
}

export function filterFeedback(items: FeedbackItem[], criteria: FeedbackFilterCriteria): FeedbackItem[] {
  return items.filter((item) => {
    if (criteria.verdict !== undefined && item.verdict !== criteria.verdict) {
      return false;
    }
    if (criteria.hasReason !== undefined) {
      const itemHasReason = item.reason != null && item.reason !== "";
      if (itemHasReason !== criteria.hasReason) {
        return false;
      }
    }
    return true;
  });
}

/**
 * E13-S014 "OK/NG rate dashboard". Computed over whatever `items` array is
 * passed in — as of E13-S021, `feedback-list.tsx` passes the CURRENT
 * PAGE's items, not the whole queue (the frozen contract has no aggregate
 * count endpoint, and inventing one is out of scope — CLAUDE.md 鐵律 1).
 * The rate is therefore honestly a per-page statistic once more than one
 * page of feedback exists; this is a real, disclosed semantic narrowing
 * from the pre-pagination "whole queue" behaviour, not a hidden one (see
 * docs/stories/E13-S021.md Assumptions).
 */
export interface FeedbackOkNgRate {
  okCount: number;
  ngCount: number;
  okRatePercent: number | null;
}

export function computeOkNgRate(items: FeedbackItem[]): FeedbackOkNgRate {
  const okCount = items.filter((item) => item.verdict === "ok").length;
  const ngCount = items.length - okCount;
  return {
    okCount,
    ngCount,
    okRatePercent: items.length === 0 ? null : Math.round((okCount / items.length) * 100),
  };
}
