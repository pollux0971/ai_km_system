"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { listErpQueries, type ErpQuerySummary } from "@/lib/erp-queries";

const logger = createLogger("web:erp-query-list");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; items: ErpQuerySummary[] };

/**
 * E09-S001 "ERP assistant home". Same loading/error/empty/loaded shape
 * MaintenanceCaseList (E07-S001) already established for the identical
 * kind of problem — a read-only landing list over a mocked async fetch.
 *
 * Items are plain text, not links — this story has no query detail route
 * to link to (and none of E09's 24 stories owns a per-query detail page;
 * E09-S015 "Query history" is the dedicated full-browse story), same
 * "don't invent a link to a route that isn't there yet" reasoning
 * MaintenanceCaseList's own doc comment gives for its own unlinked items.
 */
export default function ErpQueryList() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading ERP query list", { correlationId });

    listErpQueries().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load ERP query list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("ERP query list loaded", { correlationId, count: result.value.length });
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
    return <ErrorMessage message="無法載入 ERP 查詢紀錄。" />;
  }

  if (state.items.length === 0) {
    return <EmptyState message="尚無 ERP 查詢紀錄。" />;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {state.items.map((item) => (
        <li key={item.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
          <strong>{item.questionText}</strong>
          <br />
          <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("zh-TW")}</time>
        </li>
      ))}
    </ul>
  );
}
