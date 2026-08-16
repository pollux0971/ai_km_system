"use client";

import { useEffect, useState } from "react";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { getUser, type AdminUser } from "@/lib/users";

const logger = createLogger("admin:user-detail");

type State = { status: "loading" } | { status: "error" } | { status: "not-found" } | { status: "loaded"; user: AdminUser };

const STATUS_LABEL: Record<AdminUser["status"], string> = {
  active: "啟用中",
  disabled: "已停用",
};

/**
 * E11-S003 "User detail" — same loading/error/not-found/loaded shape
 * ErpQueryDetail (E09-S002) and CaseDetail (E07-S021) already establish
 * for a single-record detail page reached by id. Shows the same fields
 * user-list.tsx already shows per row (this MVP doesn't yet have any
 * detail-only field beyond createdAt), plus the creation date — role
 * editing/permission management are later stories' own domain
 * (E11-S006 onward), not this one's.
 */
export default function UserDetail({ userId }: { userId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading user detail", { correlationId, userId });

    getUser(userId).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load user detail", { correlationId, userId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      if (!result.value) {
        logger.info("user not found", { correlationId, userId });
        setState({ status: "not-found" });
        return;
      }

      logger.info("user detail loaded", { correlationId, userId });
      setState({ status: "loaded", user: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入使用者資料。" />;
  }

  if (state.status === "not-found") {
    return <ErrorMessage message="找不到這個使用者。" />;
  }

  const { user } = state;

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
      <p>{user.department}</p>
      <p>{user.roles.join("、")}</p>
      <p>{STATUS_LABEL[user.status]}</p>
      <p>
        建立日期：<time dateTime={user.createdAt}>{new Date(user.createdAt).toLocaleString("zh-TW")}</time>
      </p>
    </div>
  );
}
