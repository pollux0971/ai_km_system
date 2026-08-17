"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { listRoles, type RoleSummary } from "@/lib/roles";

const logger = createLogger("admin:role-list");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; roles: RoleSummary[] };

/**
 * E11-S006 "Role list" — same loading/error/empty/loaded shape
 * UserList (E11-S002) already established for this app's list pages.
 *
 * No link per row — `E11-S007` "Role editor" is the story that adds a
 * `/roles/{role}` route to link into, same "don't invent structure
 * ahead of the story that owns it" discipline user-list.tsx's own S002
 * doc comment already established for E11-S002 vs. E11-S003.
 */
export default function RoleList() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading role list", { correlationId });

    listRoles().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load role list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("role list loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", roles: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入角色清單。" />;
  }

  if (state.roles.length === 0) {
    return <EmptyState message="尚無角色。" />;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {state.roles.map((summary) => (
        <li key={summary.role} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
          <p>
            <strong>{summary.role}</strong>
          </p>
          <p>{summary.description}</p>
        </li>
      ))}
    </ul>
  );
}
