"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { listFeedback, type FeedbackItem } from "@/lib/feedback";

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
 */
export default function FeedbackList() {
  const [state, setState] = useState<State>({ status: "loading" });

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

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {state.items.map((item) => (
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
  );
}
