"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { listMaintenanceCases, type MaintenanceCaseSummary } from "@/lib/maintenance-cases";

const logger = createLogger("web:maintenance-case-list");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; items: MaintenanceCaseSummary[] };

/**
 * E07-S001 "Maintenance home". Same loading/error/empty/loaded shape
 * KnowledgeList (E05-S001) already established for the identical kind
 * of problem — a read-only landing list over a mocked async fetch.
 *
 * Items are plain text, not links — E07-S021 "Case detail" is its own
 * later story for a per-case detail route (`/maintenance/[id]`, which
 * doesn't exist yet); linking to it now would be a dead link, same
 * "don't invent a link to a route that isn't there yet" reasoning
 * KnowledgeList's own S001 doc comment already gives for why its own
 * items stayed unlinked until E05-S005 built the target route.
 */
export default function MaintenanceCaseList() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading maintenance case list", { correlationId });

    listMaintenanceCases().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load maintenance case list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("maintenance case list loaded", { correlationId, count: result.value.length });
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
    return <ErrorMessage message="無法載入維修案例列表。" />;
  }

  if (state.items.length === 0) {
    return <EmptyState message="尚無維修案例。" />;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {state.items.map((item) => (
        <li key={item.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
          <strong>{item.title}</strong>
          <br />
          <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString("zh-TW")}</time>
        </li>
      ))}
    </ul>
  );
}
