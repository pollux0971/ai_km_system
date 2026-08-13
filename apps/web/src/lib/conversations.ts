import type { ApiError, Result } from "@ai-km/types";

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessageAt: string;
  lastMessagePreview: string;
}

/**
 * Placeholder data source for the Home Dashboard's Recent Conversations
 * widget (E01-S008) — NOT the real conversation contract. Conversation
 * entities belong to E04 (Team B, RAG & Conversation Intelligence),
 * which doesn't exist yet; the real conversation list route is
 * E03-S001's job, and E03 hasn't started (E01 completes first per the
 * vertical-slice ordering). This is local, throwaway sample data for
 * this one widget only — not a shape any other story should depend on.
 */
const SAMPLE_CONVERSATIONS: ConversationSummary[] = [
  {
    id: "sample-1",
    title: "產品保固政策詢問",
    lastMessageAt: "2026-08-12T09:15:00.000Z",
    lastMessagePreview: "保固期從出貨日起算 12 個月，涵蓋原廠零件更換。",
  },
  {
    id: "sample-2",
    title: "設備 E-204 錯誤代碼排查",
    lastMessageAt: "2026-08-11T14:30:00.000Z",
    lastMessagePreview: "請確認感測器接線是否鬆脫，並重新校正歸零。",
  },
  {
    id: "sample-3",
    title: "Q3 銷售報表彙整",
    lastMessageAt: "2026-08-10T02:00:00.000Z",
    lastMessagePreview: "本季華北區成長 12%，主要來自新客戶導入。",
  },
];

export async function getRecentConversations(): Promise<Result<ConversationSummary[], ApiError>> {
  return { ok: true, value: SAMPLE_CONVERSATIONS };
}
