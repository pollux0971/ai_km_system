"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { listUsers, type AdminUser } from "@/lib/users";

const logger = createLogger("admin:user-list");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; users: AdminUser[] };

const STATUS_LABEL: Record<AdminUser["status"], string> = {
  active: "啟用中",
  disabled: "已停用",
};

/**
 * E11-S002 "User list" — same loading/error/empty/loaded shape every
 * other epic's own first list page already established (ErpQueryList,
 * MaintenanceCaseList, KnowledgeList). Deliberately does not link each
 * row to a detail page yet — E11-S003 "User detail" is the story that
 * owns the `/users/[id]` route this would point to; adding the link
 * before that route exists would be inventing structure ahead of the
 * story that owns it, same discipline erp-query-list.tsx's own doc
 * comment already established for E09-S001 vs. E09-S015.
 */
export default function UserList() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading user list", { correlationId });

    listUsers().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load user list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("user list loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", users: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入使用者清單。" />;
  }

  if (state.users.length === 0) {
    return <EmptyState message="尚無使用者。" />;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {state.users.map((user) => (
        <li key={user.userId} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
          <p>
            <strong>{user.name}</strong>
          </p>
          <p>{user.email}</p>
          <p>{user.department}</p>
          <p>{user.roles.join("、")}</p>
          <p>{STATUS_LABEL[user.status]}</p>
        </li>
      ))}
    </ul>
  );
}
