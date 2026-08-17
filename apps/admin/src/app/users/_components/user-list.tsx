"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { listUsers, type AdminUser } from "@/lib/users";
import UserStatusToggle from "./user-status-toggle";

const logger = createLogger("admin:user-list");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; users: AdminUser[] };

const STATUS_LABEL: Record<AdminUser["status"], string> = {
  active: "啟用中",
  disabled: "已停用",
};

/**
 * E11-S002 "User list" — same loading/error/empty/loaded shape every
 * other epic's own first list page already established (ErpQueryList,
 * MaintenanceCaseList, KnowledgeList).
 *
 * E11-S003 "User detail" adds the link straight to `/users/{id}` below,
 * now that the route actually exists — same "don't invent structure
 * ahead of the story that owns it" discipline erp-query-list.tsx's own
 * doc comment already established for E09-S001 vs. E09-S015.
 *
 * E11-S005 "Disable/enable user" adds a `UserStatusToggle` per row.
 * `fetchUsers` is pulled out of the mount effect (still guarded against
 * an unmounted-component state update) so the SAME fetch can be
 * re-triggered as `onToggled` — a plain re-fetch, not a local patch of
 * one row's status, same "the parent re-fetches, the child doesn't keep
 * its own state" shape KnowledgeDocumentArchiveToggle's own `onToggled`
 * callback already establishes for its sibling list.
 */
export default function UserList() {
  const [state, setState] = useState<State>({ status: "loading" });

  const fetchUsers = useCallback((cancelledRef?: { current: boolean }) => {
    const correlationId = crypto.randomUUID();
    logger.info("loading user list", { correlationId });

    listUsers().then((result) => {
      if (cancelledRef?.current) return;

      if (!result.ok) {
        logger.error("failed to load user list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("user list loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", users: result.value });
    });
  }, []);

  useEffect(() => {
    const cancelledRef = { current: false };
    fetchUsers(cancelledRef);

    return () => {
      cancelledRef.current = true;
    };
  }, [fetchUsers]);

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
            <Link href={`/users/${user.userId}`}>
              <strong>{user.name}</strong>
            </Link>
          </p>
          <p>{user.email}</p>
          <p>{user.department}</p>
          <p>{user.roles.join("、")}</p>
          <p>{STATUS_LABEL[user.status]}</p>
          <p>
            <UserStatusToggle userId={user.userId} status={user.status} onToggled={() => fetchUsers()} />
          </p>
        </li>
      ))}
    </ul>
  );
}
