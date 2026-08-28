"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { listMaintenanceCases, type MaintenanceCaseSummary } from "@/lib/maintenance-cases";
import { ERROR_CODE_OPTIONS } from "@/lib/error-codes";

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
 *
 * E07-S003 "Serial-number input" adds a conditional serial number
 * line — only rendered when `item.serialNumber` is actually present,
 * same "field absence means nothing to show, not an empty placeholder"
 * precedent knowledge-document-list.tsx's own conditional `sizeBytes`
 * line already establishes.
 *
 * E07-S004 "Error-code search UI" adds the same shape of conditional
 * line for `item.errorCode` — resolved to its own description via
 * ERROR_CODE_OPTIONS lookup, same "store the id, resolve the label by
 * lookup" precedent `equipmentId`/`boundModel` already established, so
 * this line can never drift from ERROR_CODE_OPTIONS' own wording.
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
    <ul className="m3-list">
      {state.items.map((item) => (
        <li key={item.id} className="m3-list-item">
          <strong>{item.title}</strong>
          <br />
          {item.serialNumber && (
            <>
              <span>序號:{item.serialNumber}</span>
              <br />
            </>
          )}
          {item.errorCode && (
            <>
              <span>
                錯誤代碼:{item.errorCode}
                {(() => {
                  const description = ERROR_CODE_OPTIONS.find((option) => option.code === item.errorCode)?.description;
                  return description ? ` — ${description}` : "";
                })()}
              </span>
              <br />
            </>
          )}
          <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString("zh-TW")}</time>
        </li>
      ))}
    </ul>
  );
}
