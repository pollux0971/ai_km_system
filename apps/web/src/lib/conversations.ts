import type { ApiError, Result } from "@ai-km/types";
import { AI_MODELS, DEFAULT_AI_MODEL, type AiModel } from "./ai-models";
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
   * E03-S003 introduced this as single-select (`KnowledgeScope | null`);
   * E03-S004 upgrades it to multi-select — an array, not a second
   * parallel field, since the epic's own titles ("Knowledge selector
   * single-select" then "...multi-select") frame this as the same
   * capability's next stage, not two independent ones. `[]` (nothing
   * selected) is the deliberate fail-closed default carried over
   * unchanged from S003 — SOURCE_BASELINE.md mentions "Select /
   * Auto-select Knowledge" but never defines what auto-select defaults
   * to, and Deny-Wins means presuming a default risks implying access
   * the user never actually chose. Selection is always an explicit
   * user action.
   */
  knowledgeScopes: KnowledgeScope[];
  /**
   * E03-S005. Required, not nullable — unlike knowledgeScopes (which
   * can legitimately be "nothing selected, base LLM knowledge only"),
   * a conversation always needs some model to generate any response at
   * all, even in Normal mode where the Advanced-mode-only selector
   * (this story) isn't shown to change it. Defaults to
   * DEFAULT_AI_MODEL — see lib/ai-models.ts for why no real vendor
   * name is used and why "standard" specifically is the default.
   */
  model: AiModel;
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
    knowledgeScopes: ["company", "qna"],
    model: "standard",
  },
  {
    id: "sample-2",
    title: "設備 E-204 錯誤代碼排查",
    lastMessageAt: "2026-08-11T14:30:00.000Z",
    lastMessagePreview: "請確認感測器接線是否鬆脫，並重新校正歸零。",
    mode: "normal",
    knowledgeScopes: [],
    model: "standard",
  },
  {
    id: "sample-3",
    title: "Q3 銷售報表彙整",
    lastMessageAt: "2026-08-10T02:00:00.000Z",
    lastMessagePreview: "本季華北區成長 12%，主要來自新客戶導入。",
    mode: "advanced",
    knowledgeScopes: [],
    model: "advanced-local",
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

/**
 * E03-S022 "Conversation history pagination". SOURCE_BASELINE.md gives
 * this story only its title — the epic file's own expanded title
 * ("Conversation history pagination") is what establishes this is
 * about paginating the LIST route (E03-S001), not messages within a
 * single conversation (that's a different concept entirely, never
 * named anywhere in this epic).
 *
 * `pageSize` defaults to 2 — deliberately small, chosen so this mock's
 * fixed 3-item SAMPLE_CONVERSATIONS seed set already spans exactly 2
 * pages without any test/E2E flow needing to first create additional
 * conversations through the UI. This is an honest testability-driven
 * choice for a fixed small mock dataset, not a claim about what a real
 * production page size would be — matches Functional AC 8's "MVP 可以
 * 簡化演算法" allowance the same way S021's fixed fallback sentences do.
 *
 * Page-number based (not cursor-based) — this is a plain in-memory
 * array with no concurrent-write/real-database concerns a cursor would
 * exist to solve, so offset-by-page is the simplest correct choice, not
 * an under-engineered shortcut.
 *
 * `page` is clamped to at least 1 rather than erroring on an invalid
 * value (0, negative, or beyond the last page) — this is a passive
 * display parameter, not a security- or mutation-relevant input, so
 * leniently returning the nearest valid page (or an empty `items` for
 * an out-of-range page) is more useful than fail-closed rejection,
 * which Functional AC 2 reserves for inputs that could cause an
 * incorrect result or a partial side effect; neither applies to a pure
 * read.
 */
export interface ConversationListPage {
  items: ConversationSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export const CONVERSATIONS_PAGE_SIZE = 2;

/**
 * E03-S023 "Conversation search". Same bare-title-only grounding as
 * S022 — SOURCE_BASELINE.md gives just "E03-S23 Conversation Search",
 * no body. Filters BEFORE paginating (not two independent operations
 * the caller has to combine itself) — `totalCount`/`totalPages` in the
 * returned page always describe the FILTERED set, so "page 1 of 1"
 * during an active search means "these are all the matches", not "this
 * is the first page of the unfiltered list". An empty/whitespace-only
 * query is treated as "no search" (returns everything, matching every
 * pre-S023 call site unchanged) rather than "matches nothing" — no
 * real chat product searches for an empty string as a no-results
 * query, and that reading also gives S022's own existing tests nothing
 * to update.
 *
 * Matches against `title` only, case-insensitively (Unicode-aware via
 * `.toLocaleLowerCase()`, not `.toLowerCase()`, so this isn't
 * ASCII-only-correct for Traditional Chinese content) — not
 * `lastMessagePreview`. Real chat products (ChatGPT/Claude's own
 * sidebar search, the same "real chat products" precedent already used
 * for S012/S017/S019's design calls) search conversation titles/names,
 * not full message content, and full-content search would need a
 * fundamentally different (and heavier) mechanism this MVP-simplified
 * story doesn't ask for.
 */
export async function listConversations(page = 1, query?: string): Promise<Result<ConversationListPage, ApiError>> {
  const trimmedQuery = query?.trim() ?? "";
  const all = trimmedQuery
    ? readStore().filter((item) => item.title.toLocaleLowerCase().includes(trimmedQuery.toLocaleLowerCase()))
    : readStore();
  const pageSize = CONVERSATIONS_PAGE_SIZE;
  const totalCount = all.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;

  return {
    ok: true,
    value: { items: all.slice(start, start + pageSize), page: safePage, pageSize, totalCount, totalPages },
  };
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
    knowledgeScopes: [],
    model: DEFAULT_AI_MODEL,
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

/**
 * E03-S004: replaces a conversation's full knowledge scope selection.
 * Takes the complete new set (not one add/remove at a time) — matches
 * how a checkbox group naturally reports "here's what's checked now"
 * on every change, so the caller never needs to diff against the
 * previous selection itself.
 */
export async function setConversationKnowledgeScopes(
  id: string,
  knowledgeScopes: KnowledgeScope[],
): Promise<Result<ConversationSummary, ApiError>> {
  return updateConversation(id, { knowledgeScopes });
}

/**
 * E03-S005: switches a conversation's model. Rejects a disabled model
 * (e.g. "cloud", per SOURCE_BASELINE decision #29) server-side too —
 * not just relying on the UI's disabled <option>, which a buggy or
 * bypassed client could ignore. AI/RAG Boundary: "Model/provider
 * fallback 不得把資料送往未允許的 external provider" — this is that
 * same guarantee applied to an explicit user selection, not just an
 * automatic fallback.
 */
export async function setConversationModel(
  id: string,
  model: AiModel,
): Promise<Result<ConversationSummary, ApiError>> {
  const option = AI_MODELS.find((candidate) => candidate.id === model);
  if (!option || option.disabled) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "這個模型目前無法使用。" } };
  }
  return updateConversation(id, { model });
}

/**
 * E03-S009: called by lib/messages.ts once a message is actually sent,
 * so the conversation list/dashboard preview reflects the latest
 * message instead of staying frozen at whatever createConversation()
 * set — completing the intent `lastMessageAt`/`lastMessagePreview` were
 * already declared for back in E03-S001, which had no way to update
 * them yet since no message could ever be sent until now.
 */
export async function touchConversationLastMessage(
  id: string,
  lastMessagePreview: string,
  lastMessageAt: string,
): Promise<Result<ConversationSummary, ApiError>> {
  return updateConversation(id, { lastMessagePreview, lastMessageAt });
}
