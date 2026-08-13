import type { ApiError, Result } from "@ai-km/types";

export interface NotificationSummary {
  id: string;
  title: string;
  createdAt: string;
  read: boolean;
}

/**
 * Placeholder data source for the Notification Center (E01-S014) — NOT
 * a real contract. No Team B epic currently owns a notification/event
 * service (the closest is E14 Audit/Observability, which doesn't exist
 * yet either); this is local, throwaway sample data until a real
 * notification source is defined.
 */
const SAMPLE_NOTIFICATIONS: NotificationSummary[] = [
  {
    id: "notif-1",
    title: "知識庫「產品保固政策」已更新",
    createdAt: "2026-08-13T01:00:00.000Z",
    read: false,
  },
  {
    id: "notif-2",
    title: "您的維修案件 #204 已指派工程師",
    createdAt: "2026-08-12T08:00:00.000Z",
    read: false,
  },
  {
    id: "notif-3",
    title: "系統將於本週六進行例行維護",
    createdAt: "2026-08-10T00:00:00.000Z",
    read: true,
  },
];

export async function getNotifications(): Promise<Result<NotificationSummary[], ApiError>> {
  return { ok: true, value: SAMPLE_NOTIFICATIONS };
}
