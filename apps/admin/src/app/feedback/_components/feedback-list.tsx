"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import {
  computeOkNgRate,
  filterFeedback,
  listFeedback,
  type FeedbackFilterCriteria,
  type FeedbackItem,
} from "@/lib/feedback";

const logger = createLogger("admin:feedback-list");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; items: FeedbackItem[] };

const VERDICT_LABEL: Record<FeedbackItem["verdict"], string> = {
  ok: "OK",
  ng: "NG",
};

/**
 * E11-S016 "Feedback queue" — same loading/error/empty/loaded shape
 * `AuditEventList` (E11-S015) already establishes for a sibling
 * "always empty today" read-only viewer.
 *
 * E11-S017 "Feedback detail" adds the link straight to `/feedback/{id}`
 * below, now that the route actually exists — same "don't invent
 * structure ahead of the story that owns it" discipline user-list.tsx's
 * own doc comment already establishes for E11-S002 vs. E11-S003.
 *
 * E13-S007 "feedback queue filter" — narrows the already-loaded `items`
 * client-side via `filterFeedback` (a pure function, no new fetch). The
 * filter controls only render once real items exist to filter; while the
 * queue is genuinely empty (today's only real production state) there is
 * nothing to filter, so showing the controls would be misleading UI
 * chrome. A filter narrowing a non-empty list down to zero matches shows
 * a distinct message ("沒有符合篩選條件的回饋。") from the genuinely-empty
 * queue message ("尚無回饋。") — conflating "nothing exists" with
 * "nothing matches your filter" would misrepresent which one is true.
 *
 * E13-S014 "OK/NG rate dashboard" — the OK/NG rate stat above the filter
 * fieldset is computed from `items` (the whole loaded queue), not
 * `filtered` — it's an overview metric of the queue itself, distinct in
 * purpose from the filter below it (which narrows what's browsed, not
 * what's measured). `computeOkNgRate` can return a `null` rate for zero
 * samples, but that branch is unreachable here: this component only ever
 * renders once `FeedbackList` above has already confirmed `items.length >
 * 0`, so the stat is always a real number in practice.
 */
export default function FeedbackList() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [criteria, setCriteria] = useState<FeedbackFilterCriteria>({});

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading feedback list", { correlationId });

    listFeedback().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load feedback list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("feedback list loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", items: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入回饋清單。" />;
  }

  if (state.items.length === 0) {
    return <EmptyState message="尚無回饋。" />;
  }

  return <LoadedFeedbackList items={state.items} criteria={criteria} onCriteriaChange={setCriteria} />;
}

function LoadedFeedbackList({
  items,
  criteria,
  onCriteriaChange,
}: {
  items: FeedbackItem[];
  criteria: FeedbackFilterCriteria;
  onCriteriaChange: (criteria: FeedbackFilterCriteria) => void;
}) {
  const filtered = useMemo(() => filterFeedback(items, criteria), [items, criteria]);
  const rate = useMemo(() => computeOkNgRate(items), [items]);

  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        OK 比例:{rate.okRatePercent}%(OK {rate.okCount} / NG {rate.ngCount},共 {items.length} 筆)
      </p>
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

      {filtered.length === 0 ? (
        <EmptyState message="沒有符合篩選條件的回饋。" />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {filtered.map((item) => (
            <li key={item.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
              <p>
                <Link href={`/feedback/${item.id}`}>
                  <strong>{VERDICT_LABEL[item.verdict]}</strong>
                </Link>
              </p>
              {item.reason && <p>{item.reason}</p>}
              <p>
                <time dateTime={item.submittedAt}>{new Date(item.submittedAt).toLocaleString("zh-TW")}</time>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
