"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getNotifications, type NotificationSummary } from "@/lib/notifications";

const logger = createLogger("web:notification-center");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; items: NotificationSummary[] };

/**
 * E01-S014 Notification Center thin slice: a header button showing the
 * unread count, opening a read-only list panel. No Team B epic owns a
 * notification service yet (reads from apps/web/src/lib/notifications.ts's
 * placeholder data — see that file's doc comment), so there's no
 * "mark as read" action here — that needs a real backend mutation this
 * story doesn't have anything to call. Uses the E01-S011/S012/S013
 * shared loading/error/empty components.
 */
export default function NotificationCenter() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();

    logger.info("loading notifications", { correlationId });

    getNotifications().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load notifications", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("notifications loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", items: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const unreadCount = state.status === "loaded" ? state.items.filter((item) => !item.read).length : 0;

  return (
    <div style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="dialog">
        通知{unreadCount > 0 ? `（${unreadCount}）` : ""}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="通知中心"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            border: "1px solid #e5e5e5",
            background: "#ffffff",
            padding: 8,
            minWidth: 240,
          }}
        >
          {state.status === "loading" && <LoadingIndicator />}
          {state.status === "error" && <ErrorMessage message="無法載入通知。" />}
          {state.status === "loaded" && state.items.length === 0 && <EmptyState message="目前沒有通知。" />}
          {state.status === "loaded" && state.items.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {state.items.map((item) => (
                <li key={item.id} style={{ marginBottom: 8, fontWeight: item.read ? "normal" : "bold" }}>
                  {item.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
