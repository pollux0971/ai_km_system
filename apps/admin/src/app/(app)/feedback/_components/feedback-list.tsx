"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { computeOkNgRate, listFeedback, type FeedbackFilterCriteria, type FeedbackItem } from "@/lib/feedback";

const logger = createLogger("admin:feedback-list");

const DEFAULT_PAGE_SIZE = 20;

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "forbidden" }
  | { status: "loaded"; items: FeedbackItem[]; page: number; totalPages: number };

const VERDICT_LABEL: Record<FeedbackItem["verdict"], string> = {
  ok: "OK",
  ng: "NG",
};

function hasActiveCriteria(criteria: FeedbackFilterCriteria): boolean {
  return criteria.verdict !== undefined || criteria.hasReason !== undefined;
}

/**
 * E11-S016 "Feedback queue" — same loading/error/empty/loaded shape
 * `AuditEventList` (E11-S015) already establishes for a sibling read-only
 * viewer, plus a `"forbidden"` state (E13-S021 AC2) distinct from a
 * generic network/server error — a 403 means "you are not allowed to see
 * this", which is a materially different fact from "something broke".
 *
 * E13-S007 "feedback queue filter" — as of E13-S021, `verdict`/`hasReason`
 * are sent to the server as real query parameters (`listFeedback`'s own
 * doc comment explains why this replaces the old client-side
 * `filterFeedback` call). Changing either resets `page` back to 1 — same
 * reasoning `conversation-list.tsx` (E03-S023) already establishes:
 * without this, changing filters while on page 2 could land past the new,
 * smaller result set's own last page.
 *
 * E13-S021 "分頁" reuses `conversation-list.tsx`'s own pagination pattern
 * (E03-S022): `page` is its own piece of state, included in the fetch
 * effect's dependency array, prev/next buttons only (no numbered pages).
 *
 * A filter narrowing the queue down to zero matches shows a distinct
 * message ("沒有符合篩選條件的回饋。") from the genuinely-empty queue
 * message ("尚無回饋。") — unchanged wording from before E13-S021,
 * distinguished now by whether any filter criteria is active rather than
 * by comparing loaded-vs-filtered arrays (there is only ever one,
 * server-filtered array now).
 *
 * E13-S014 "OK/NG rate dashboard" — computed over the CURRENT PAGE's
 * items only as of E13-S021 (see `computeOkNgRate`'s own doc comment for
 * why: the frozen contract has no aggregate count endpoint).
 */
export default function FeedbackList() {
  const [page, setPage] = useState(1);
  const [criteria, setCriteria] = useState<FeedbackFilterCriteria>({});
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading feedback list", { correlationId, page, criteria });

    setState({ status: "loading" });
    listFeedback({ ...criteria, page, pageSize: DEFAULT_PAGE_SIZE }).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load feedback list", { correlationId, code: result.error.code });
        setState(result.error.code === "PERMISSION_DENIED" ? { status: "forbidden" } : { status: "error" });
        return;
      }

      logger.info("feedback list loaded", { correlationId, count: result.value.items.length });
      setState({
        status: "loaded",
        items: result.value.items,
        page: result.value.page,
        totalPages: result.value.totalPages,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [page, criteria]);

  function handleCriteriaChange(next: FeedbackFilterCriteria) {
    setCriteria(next);
    setPage(1);
  }

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入回饋清單。" />;
  }

  if (state.status === "forbidden") {
    return <ErrorMessage message="您沒有權限查看回饋佇列。" />;
  }

  return (
    <LoadedFeedbackList
      items={state.items}
      page={state.page}
      totalPages={state.totalPages}
      criteria={criteria}
      onCriteriaChange={handleCriteriaChange}
      onPageChange={setPage}
    />
  );
}

function LoadedFeedbackList({
  items,
  page,
  totalPages,
  criteria,
  onCriteriaChange,
  onPageChange,
}: {
  items: FeedbackItem[];
  page: number;
  totalPages: number;
  criteria: FeedbackFilterCriteria;
  onCriteriaChange: (criteria: FeedbackFilterCriteria) => void;
  onPageChange: (page: number) => void;
}) {
  const rate = computeOkNgRate(items);
  // Filters render whenever there's something to browse OR a filter is
  // already narrowing an otherwise-nonempty queue down to zero (so the
  // caller can adjust/clear it) — only hidden for the genuinely-fresh,
  // no-filter, zero-item state, same "nothing to filter yet" reasoning
  // this component always had, adapted for server-side filtering
  // (E13-S021): there is no longer a client-held "whole queue" to check
  // the length of, only the current filtered page.
  const showFilters = items.length > 0 || hasActiveCriteria(criteria);

  return (
    <div>
      {items.length > 0 && (
        <p style={{ marginBottom: 16 }}>
          OK 比例:{rate.okRatePercent}%(OK {rate.okCount} / NG {rate.ngCount},本頁共 {items.length} 筆)
        </p>
      )}
      {showFilters && (
        <fieldset style={{ border: "none", padding: 0, marginBottom: 16 }}>
          <legend style={{ marginBottom: 8 }}>篩選</legend>
          <p>
            <label htmlFor="feedback-verdict-filter">依判斷篩選</label>
            <select
              id="feedback-verdict-filter"
              value={criteria.verdict ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                onCriteriaChange({ ...criteria, verdict: value === "" ? undefined : (value as FeedbackItem["verdict"]) });
              }}
            >
              <option value="">全部</option>
              <option value="ok">只看 OK</option>
              <option value="ng">只看 NG</option>
            </select>
          </p>
          <p>
            <label htmlFor="feedback-has-reason-filter">
              <input
                id="feedback-has-reason-filter"
                type="checkbox"
                checked={criteria.hasReason === true}
                onChange={(event) => {
                  onCriteriaChange({ ...criteria, hasReason: event.target.checked ? true : undefined });
                }}
              />
              只顯示有填寫原因的回饋
            </label>
          </p>
        </fieldset>
      )}

      {items.length === 0 ? (
        <EmptyState message={hasActiveCriteria(criteria) ? "沒有符合篩選條件的回饋。" : "尚無回饋。"} />
      ) : (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((item) => (
              <li key={item.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
                <p>
                  <Link href={`/feedback/${item.id}`}>
                    <strong>{VERDICT_LABEL[item.verdict]}</strong>
                  </Link>
                </p>
                {item.reason && <p>{item.reason}</p>}
                <p>{item.answerExcerpt}</p>
                <p>
                  <time dateTime={item.submittedAt}>{new Date(item.submittedAt).toLocaleString("zh-TW")}</time>
                </p>
              </li>
            ))}
          </ul>
          {totalPages > 1 && (
            <nav aria-label="回饋佇列分頁">
              <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
                上一頁
              </button>
              <span>
                第 {page} 頁,共 {totalPages} 頁
              </span>
              <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
                下一頁
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
