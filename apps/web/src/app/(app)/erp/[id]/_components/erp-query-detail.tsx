"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getErpQuery, type ErpQuerySummary } from "@/lib/erp-queries";

const logger = createLogger("web:erp-query-detail");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "loaded"; erpQuery: ErpQuerySummary };

/**
 * E09-S002 "Natural-language query composer" — the `/erp/[id]` route
 * NewErpQueryPage redirects to on a successful submission. Minimal
 * shell for now: shows the question and when it was asked. E09-S003
 * "Query scenario selector" onward (S004 clarification, S005
 * confirmation, S006 loading, S007+ results) are their own separate
 * stories that grow what this page actually shows once a query has been
 * submitted — same "don't invent a field/section ahead of the story
 * that owns it" discipline this codebase applies everywhere else.
 *
 * Deliberately does NOT retrofit ErpQueryList (S001) into linking here,
 * same self-adopted scope boundary CaseDetail (E07-S021) already
 * documents for MaintenanceCaseList — ErpQueryList's own "renders no
 * links" test already asserts exactly zero links, and turning items
 * into links would flip that assertion's truth value, which doesn't fit
 * the narrow test-freeze exception (add interaction steps, keep
 * assertions unchanged).
 */
export default function ErpQueryDetail({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading ERP query detail", { correlationId, id });

    getErpQuery(id).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load ERP query", { correlationId, id, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      if (!result.value) {
        logger.info("ERP query not found", { correlationId, id });
        setState({ status: "not-found" });
        return;
      }

      logger.info("ERP query detail loaded", { correlationId, id });
      setState({ status: "loaded", erpQuery: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <main style={{ padding: 32 }}>
        <LoadingIndicator />
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main style={{ padding: 32 }}>
        <ErrorMessage message="無法載入 ERP 查詢。" />
      </main>
    );
  }

  if (state.status === "not-found") {
    return (
      <main style={{ padding: 32 }}>
        <ErrorMessage code="NOT_FOUND" />
      </main>
    );
  }

  const { erpQuery } = state;

  return (
    <main style={{ padding: 32 }}>
      <h1>{erpQuery.questionText}</h1>
      <p>
        <time dateTime={erpQuery.createdAt}>{new Date(erpQuery.createdAt).toLocaleString("zh-TW")}</time>
      </p>
      <p>
        <Link href="/erp">返回 ERP 助手首頁</Link>
      </p>
    </main>
  );
}
