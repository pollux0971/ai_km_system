"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { listPermissionMatrix, ALL_CAPABILITIES, type PermissionMatrixRow } from "@/lib/permission-matrix";

const logger = createLogger("admin:permission-matrix");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; rows: PermissionMatrixRow[] };

/**
 * E11-S008 "Permission matrix" — same loading/error/empty/loaded shape
 * RoleList (E11-S006) already establishes for this app's list pages,
 * rendered as a real `<table>` (role rows × capability columns) rather
 * than RoleList's `<ul>` — a matrix is inherently two-dimensional, and
 * a checkmark/blank cell (not color alone) matches the Frontend/UX
 * Boundary's "不得只靠顏色傳達狀態".
 */
export default function PermissionMatrix() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading permission matrix", { correlationId });

    listPermissionMatrix().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load permission matrix", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("permission matrix loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", rows: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入權限矩陣。" />;
  }

  if (state.rows.length === 0) {
    return <EmptyState message="尚無權限資料。" />;
  }

  return (
    <table>
      <thead>
        <tr>
          <th scope="col">角色</th>
          {ALL_CAPABILITIES.map((capability) => (
            <th scope="col" key={capability}>
              {capability}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {state.rows.map((row) => (
          <tr key={row.role}>
            <th scope="row">{row.role}</th>
            {ALL_CAPABILITIES.map((capability) => (
              <td key={capability}>{row.capabilities.includes(capability) ? "✓" : ""}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
