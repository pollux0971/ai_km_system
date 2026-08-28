import { toResult } from "@ai-km/api-client";
import type { ApiError, Result } from "@ai-km/types";
import { AI_MODELS, DEFAULT_AI_MODEL, type AiModel } from "./ai-models";
import { apiClient } from "./api";
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
  /**
   * E03-S026 "Archive/unarchive conversation". Optional rather than an
   * always-present `false`, same reasoning as messages.ts's `revisions`/
   * `state` fields: every pre-S026 test fixture across S001-S025 simply
   * omits it, and every read site treats an absent value as `false`
   * (not archived) — making it required would force a mechanical,
   * behavior-unrelated update to every one of those existing fixtures.
   */
  archived?: boolean;
  /**
   * E03-S036: server-owned, present on every real/fake-API response. Optional here
   * (not required) purely so every pre-S036 fixture/test that constructs a
   * ConversationSummary literal without these two fields keeps typechecking — the
   * same "optional so old fixtures don't need mechanical updates" reasoning as
   * `archived` above.
   */
  createdAt?: string;
  updatedAt?: string;
}

export interface ConversationListPage {
  items: ConversationSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/** Server caps pageSize at 200 (contracts/openapi/conversations.yaml) — used by listActiveConversations to approximate "no pagination". */
const MAX_PAGE_SIZE = 200;

const DEFAULT_CONVERSATIONS_PAGE_SIZE = 20;

/**
 * E03-S046. `CONVERSATIONS_PAGE_SIZE` used to be hardcoded to 2 — E03-S022's
 * own EVIDENCE admits that value existed purely so the 3-conversation seed
 * fixture landed on exactly 2 pages, not as a real production page size.
 * `NEXT_PUBLIC_` (not a plain server-only env var) because this value is
 * read from client-rendered pagination UI — Next.js only inlines
 * `NEXT_PUBLIC_*` vars into the browser bundle. Exported (not just called
 * inline below) so it's directly unit-testable without needing
 * `vi.resetModules()` + dynamic re-import gymnastics to exercise each env
 * value against a freshly-evaluated module.
 */
export function readPageSize(): number {
  const raw = process.env.NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE;
  if (raw === undefined) return DEFAULT_CONVERSATIONS_PAGE_SIZE;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_SIZE) {
    console.warn(
      `[conversations] Invalid NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE="${raw}" (must be an integer 1-${MAX_PAGE_SIZE}) — falling back to default ${DEFAULT_CONVERSATIONS_PAGE_SIZE}.`,
    );
    return DEFAULT_CONVERSATIONS_PAGE_SIZE;
  }
  return parsed;
}

// Computed once at module load, not per-call — every existing import site
// (including conversations.test.ts's own assertions) uses this as a plain
// number, not a function call, so the name/shape stays unchanged; only
// where its value comes from changes.
export const CONVERSATIONS_PAGE_SIZE = readPageSize();

/**
 * Home Dashboard's Recent Conversations widget (E01-S008): top 3, unarchived, most
 * recent first — the server already returns `listConversations` sorted by
 * `lastMessageAt` descending, so this is just that endpoint with `pageSize: 3`.
 */
export async function getRecentConversations(): Promise<Result<ConversationSummary[], ApiError>> {
  const result = await toResult(
    apiClient.conversations.GET("/conversations", { params: { query: { page: 1, pageSize: 3, archived: false } } }),
  );
  if (!result.ok) return result;
  return { ok: true, value: result.value.items };
}

/**
 * E03-S022 "Conversation history pagination" / E03-S023 "Conversation search" /
 * E03-S026 archived view — all three live on the server's single `GET /conversations`
 * (contracts/openapi/conversations.yaml), which already implements the same
 * archived-switch -> search -> paginate order this function used to implement locally.
 * `page` is still clamped to >=1 client-side (the server does too, but this avoids
 * relying on that for a plain display parameter — same reasoning as before E03-S036).
 */
export async function listConversations(
  page = 1,
  query?: string,
  archived = false,
): Promise<Result<ConversationListPage, ApiError>> {
  const safePage = Math.max(1, page);
  const trimmedQuery = query?.trim() ?? "";
  return toResult(
    apiClient.conversations.GET("/conversations", {
      params: {
        query: {
          page: safePage,
          pageSize: CONVERSATIONS_PAGE_SIZE,
          ...(trimmedQuery ? { q: trimmedQuery } : {}),
          archived,
        },
      },
    }),
  );
}

/**
 * ux/enterprise-polish: the sidebar's conversation-history section — ALL unarchived
 * conversations, most-recent first, unpaginated. The contract has no unbounded "list
 * everything" endpoint, so this requests the server's max pageSize (200) as a practical
 * "get everything" call — reasonable at this MVP's scale (ASSUMPTION, see EVIDENCE).
 */
export async function listActiveConversations(): Promise<Result<ConversationSummary[], ApiError>> {
  const result = await toResult(
    apiClient.conversations.GET("/conversations", {
      params: { query: { page: 1, pageSize: MAX_PAGE_SIZE, archived: false } },
    }),
  );
  if (!result.ok) return result;
  return { ok: true, value: result.value.items };
}

/**
 * E03-S002: a single conversation for the detail route. `value: null` (not an error)
 * when the id doesn't match anything owned by the caller (404 `NOT_FOUND`) — "not
 * found" is an expected outcome to render distinctly, not a dependency failure, same
 * modeling as `AuthClient.getSession()`. A 403 (the id exists but belongs to someone
 * else) stays `ok:false PERMISSION_DENIED` — deliberately NOT folded into null, so the
 * UI can show a permission-denied state instead of an indistinguishable empty one
 * (Frontend/UX Boundary: "不得把 403 當 empty data").
 */
export async function getConversation(id: string): Promise<Result<ConversationSummary | null, ApiError>> {
  const result = await toResult(
    apiClient.conversations.GET("/conversations/{conversationId}", { params: { path: { conversationId: id } } }),
  );
  if (!result.ok && result.error.code === "NOT_FOUND") {
    return { ok: true, value: null };
  }
  return result;
}

/**
 * E03-S001: creates a new conversation and prepends it to the list (so it immediately
 * shows up in both listConversations() and getRecentConversations()). Every field
 * besides `mode` is a server-assigned default (contracts/openapi/conversations.yaml's
 * `CreateConversationRequest`) — this adapter doesn't send a body at all, matching the
 * pre-S036 signature (zero args) exactly.
 */
export async function createConversation(): Promise<Result<ConversationSummary, ApiError>> {
  return toResult(apiClient.conversations.POST("/conversations", {}));
}

/**
 * Shared PATCH wrapper for every per-conversation field this detail page can change.
 * 404 stays NOT_FOUND (not silently no-op-ing) so a caller can't mistake "nothing
 * happened because the id was stale" for "the update succeeded" — same as before S036.
 */
async function updateConversation(
  id: string,
  patch: Partial<Pick<ConversationSummary, "title" | "mode" | "knowledgeScopes" | "model" | "archived">>,
): Promise<Result<ConversationSummary, ApiError>> {
  return toResult(
    apiClient.conversations.PATCH("/conversations/{conversationId}", {
      params: { path: { conversationId: id } },
      body: patch,
    }),
  );
}

/** E03-S002: switches a conversation's mode. */
export async function setConversationMode(
  id: string,
  mode: ConversationMode,
): Promise<Result<ConversationSummary, ApiError>> {
  return updateConversation(id, { mode });
}

/**
 * E03-S004: replaces a conversation's full knowledge scope selection. Takes the
 * complete new set (not one add/remove at a time) — matches how a checkbox group
 * naturally reports "here's what's checked now" on every change.
 */
export async function setConversationKnowledgeScopes(
  id: string,
  knowledgeScopes: KnowledgeScope[],
): Promise<Result<ConversationSummary, ApiError>> {
  return updateConversation(id, { knowledgeScopes });
}

/**
 * E03-S005: switches a conversation's model. Rejects a disabled model (e.g. "cloud",
 * per SOURCE_BASELINE decision #29) client-side too, before ever calling the server —
 * not just relying on the UI's disabled <option>, which a buggy or bypassed client
 * could ignore. The server enforces the same rule independently (AI/RAG Boundary:
 * "Model/provider fallback 不得把資料送往未允許的 external provider"); this is a
 * defensive duplicate of that same guarantee, not a looser client-side shortcut.
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
 * E03-S024 "Rename conversation". Fails closed with VALIDATION_ERROR for an
 * empty/whitespace-only title client-side too (trimmed before sending) — the server
 * enforces the identical rule (contracts/openapi/conversations.yaml's
 * `UpdateConversationRequest.title`: "Trimmed before validation; empty-after-trim is
 * 400"), so this avoids a round trip for an input that would only ever fail anyway.
 */
export async function renameConversation(id: string, title: string): Promise<Result<ConversationSummary, ApiError>> {
  const trimmed = title.trim();
  if (!trimmed) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "對話名稱不得為空。" } };
  }
  return updateConversation(id, { title: trimmed });
}

/**
 * E03-S025 "Delete conversation confirmation". A REAL removal, not a soft/archived
 * flag (E03-S026 owns that separate capability). Fails closed with NOT_FOUND for an id
 * that doesn't match anything, so a caller (or a duplicate/retried request) can't
 * mistake "already gone" for "just deleted it".
 */
export async function deleteConversation(id: string): Promise<Result<void, ApiError>> {
  const result = await toResult(
    apiClient.conversations.DELETE("/conversations/{conversationId}", { params: { path: { conversationId: id } } }),
  );
  return result.ok ? { ok: true, value: undefined } : result;
}

/**
 * E03-S026 "Archive/unarchive conversation". Two separate, explicitly-named functions
 * (not a generic field setter) so each call site reads as the action it actually is.
 * Reversible, unlike deleteConversation's permanent removal.
 */
export async function archiveConversation(id: string): Promise<Result<ConversationSummary, ApiError>> {
  return updateConversation(id, { archived: true });
}

export async function unarchiveConversation(id: string): Promise<Result<ConversationSummary, ApiError>> {
  return updateConversation(id, { archived: false });
}
