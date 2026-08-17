"use client";

import { useEffect, useState } from "react";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { getFeedback, type FeedbackItem } from "@/lib/feedback";

const logger = createLogger("admin:feedback-detail");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "loaded"; feedback: FeedbackItem };

const VERDICT_LABEL: Record<FeedbackItem["verdict"], string> = {
  ok: "OK",
  ng: "NG",
};

/**
 * E11-S017 "Feedback detail" — same loading/error/not-found/loaded shape
 * UserDetail (E11-S003) already establishes for a single-record detail
 * page reached by id. Shows the same fields feedback-list.tsx already
 * shows per row (this MVP doesn't yet have any detail-only field beyond
 * what the row already surfaces) — getFeedback(id) is unconditionally
 * `null` for every id today (see feedback.ts's own doc comment), so the
 * loaded state only exercises via test fixtures right now, same honest
 * limitation AuditEventList's own empty-viewer precedent already lives
 * with.
 */
export default function FeedbackDetail({ feedbackId }: { feedbackId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading feedback detail", { correlationId, feedbackId });

    getFeedback(feedbackId).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load feedback detail", { correlationId, feedbackId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      if (!result.value) {
        logger.info("feedback not found", { correlationId, feedbackId });
        setState({ status: "not-found" });
        return;
      }

      logger.info("feedback detail loaded", { correlationId, feedbackId });
      setState({ status: "loaded", feedback: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, [feedbackId]);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入回饋資料。" />;
  }

  if (state.status === "not-found") {
    return <ErrorMessage message="找不到這筆回饋。" />;
  }

  const { feedback } = state;

  return (
    <div>
      <h1>{VERDICT_LABEL[feedback.verdict]}</h1>
      {feedback.reason && <p>{feedback.reason}</p>}
      <p>
        <time dateTime={feedback.submittedAt}>{new Date(feedback.submittedAt).toLocaleString("zh-TW")}</time>
      </p>
    </div>
  );
}
