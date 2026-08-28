"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
 * E09-S015 "Query history" links each item to its own `/erp/{id}`
 * detail page — the dedicated full-browse story this file's own doc
 * comment named since S001. Every S007-S014 story deliberately left
 * this list untouched precisely so this one story could claim it
 * cleanly; clicking through reveals whatever state that query is
 * actually in (still confirming a scenario, executing, or fully
 * settled with all of S007-S014's own result/metadata content) — no
 * new logic here, `/erp/[id]`'s own page already handles every state.
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
    <ul className="m3-list">
      {state.items.map((item) => (
        <li key={item.id} className="m3-list-item">
          <Link className="m3-list-item-link" href={`/erp/${item.id}`}>
            <strong>{item.questionText}</strong>
            <br />
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("zh-TW")}</time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
