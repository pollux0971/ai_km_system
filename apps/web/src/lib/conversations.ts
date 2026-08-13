import type { ApiError, Result } from "@ai-km/types";
import type { KnowledgeScope } from "./knowledge-scopes";

export type ConversationMode = "normal" | "advanced";

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  /**
   * E03-S002. Per SOURCE_BASELINE.md's E03 outline, later stories key
   * off this (e.g. E03-S05 Model Selector is "Advanced mode" only) —
   * required, not optional, since every conversation has a mode from
   * the moment it's created.
   */
  mode: ConversationMode;
  /**
   * E03-S003. `null` — not defaulted to any scope — is the deliberate
   * fail-closed choice: SOURCE_BASELINE.md mentions "Select /
   * Auto-select Knowledge" but never defines what auto-select defaults
   * to, and Deny-Wins means presuming a broad default (e.g. "company")
   * risks implying access the user never actually chose. Selection is
   * always an explicit user action.
   */
  knowledgeScope: KnowledgeScope | null;
}

/**
 * Placeholder data source — NOT the real conversation contract.
 * Conversation entities belong to E04 (Team B, RAG & Conversation
 * Intelligence), which doesn't exist yet; contracts/openapi/core.yaml
 * has no paths for it. Until E04's contract exists, this is a local mock
 * serving both the Home Dashboard's Recent Conversations widget
 * (E01-S008) and E03-S001's conversation list/new route — one shared
 * shape, not two divergent ones.
 */
const SAMPLE_CONVERSATIONS: ConversationSummary[] = [
  {
    id: "sample-1",
    title: "產品保固政策詢問",
    lastMessageAt: "2026-08-12T09:15:00.000Z",
    lastMessagePreview: "保固期從出貨日起算 12 個月，涵蓋原廠零件更換。",
    mode: "normal",
    knowledgeScope: "company",
  },
  {
    id: "sample-2",
    title: "設備 E-204 錯誤代碼排查",
    lastMessageAt: "2026-08-11T14:30:00.000Z",
    lastMessagePreview: "請確認感測器接線是否鬆脫，並重新校正歸零。",
    mode: "normal",
    knowledgeScope: null,
  },
  {
    id: "sample-3",
    title: "Q3 銷售報表彙整",
    lastMessageAt: "2026-08-10T02:00:00.000Z",
    lastMessagePreview: "本季華北區成長 12%，主要來自新客戶導入。",
    mode: "advanced",
    knowledgeScope: null,
  },
];

const STORAGE_KEY = "ai-km:mock-conversations";

/**
 * Persisted via sessionStorage, not a plain module-level variable.
 * Next.js's App Router route-based code-splitting can give independently
 * loaded pages their own separate evaluation of a module that's only
 * imported from page-level (non-shared-layout) components — unlike
 * apps/web/src/lib/auth.ts's authClient, which survives navigation
 * because it's imported from (app)/session-gate.tsx, part of the shared
 * layout that loads once. This module is imported from three separate
 * leaf pages (Home's RecentConversations widget, /conversations,
 * /conversations/new), so a plain in-memory array doesn't reliably
 * survive navigating between them. sessionStorage is genuinely shared
 * across the whole browser tab regardless of which JS chunk happens to
 * be currently loaded, and — like the in-memory array it replaces —
 * still doesn't survive a full page reload/new tab, which remains an
 * accepted limitation of a frontend-only mock, not a bug to fix here.
 */
function readStore(): ConversationSummary[] {
  if (typeof window === "undefined") return SAMPLE_CONVERSATIONS;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return SAMPLE_CONVERSATIONS;
  try {
    return JSON.parse(raw) as ConversationSummary[];
  } catch {
    return SAMPLE_CONVERSATIONS;
  }
}

function writeStore(items: ConversationSummary[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/** Home Dashboard's Recent Conversations widget (E01-S008): top 3 only. */
export async function getRecentConversations(): Promise<Result<ConversationSummary[], ApiError>> {
  return { ok: true, value: readStore().slice(0, 3) };
}

/** E03-S001: the full conversation list route's data source. */
export async function listConversations(): Promise<Result<ConversationSummary[], ApiError>> {
  return { ok: true, value: readStore() };
}

/**
 * E03-S002: a single conversation for the detail route. `value: null`
 * (not an error) when the id doesn't match anything — "not found" is an
 * expected outcome to render distinctly, not a dependency failure —
 * same modeling as AuthClient.getSession()'s Result<Session | null, _>.
 */
export async function getConversation(id: string): Promise<Result<ConversationSummary | null, ApiError>> {
  return { ok: true, value: readStore().find((item) => item.id === id) ?? null };
}

/**
 * E03-S001: creates a new conversation and prepends it to the list (so
 * it immediately shows up in both listConversations() and
 * getRecentConversations()). The actual chat interface — composing and
 * sending the first message — is out of scope here; that's E03-S002's
 * "Normal/Advanced mode switch" and beyond. This only proves the
 * "start a new conversation" entity-creation action itself works.
 */
export async function createConversation(): Promise<Result<ConversationSummary, ApiError>> {
  const conversation: ConversationSummary = {
    id: crypto.randomUUID(),
    title: "新對話",
    lastMessageAt: new Date().toISOString(),
    lastMessagePreview: "尚無訊息。",
    mode: "normal",
    knowledgeScope: null,
  };
  writeStore([conversation, ...readStore()]);
  return { ok: true, value: conversation };
}

/**
 * Shared by setConversationMode/setConversationKnowledgeScope (and any
 * future per-conversation field this detail page grows). NOT_FOUND
 * (rather than silently no-op-ing) if the id doesn't match anything, so
 * a caller can't mistake "nothing happened because the id was stale"
 * for "the update succeeded".
 */
async function updateConversation(
  id: string,
  patch: Partial<Omit<ConversationSummary, "id">>,
): Promise<Result<ConversationSummary, ApiError>> {
  const store = readStore();
  const existing = store.find((item) => item.id === id);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } };
  }

  const updated: ConversationSummary = { ...existing, ...patch };
  writeStore(store.map((item) => (item.id === id ? updated : item)));
  return { ok: true, value: updated };
}

/** E03-S002: switches a conversation's mode. */
export async function setConversationMode(
  id: string,
  mode: ConversationMode,
): Promise<Result<ConversationSummary, ApiError>> {
  return updateConversation(id, { mode });
}

/** E03-S003: switches a conversation's knowledge scope. */
export async function setConversationKnowledgeScope(
  id: string,
  knowledgeScope: KnowledgeScope | null,
): Promise<Result<ConversationSummary, ApiError>> {
  return updateConversation(id, { knowledgeScope });
}
