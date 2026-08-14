import type { ApiError, Result } from "@ai-km/types";
import type { Role } from "@ai-km/permissions";

export interface KnowledgeBaseSummary {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  /**
   * E05-S006 "KB permission editor". Optional, not defaulted to `[]` at
   * every read site the way E03-S026's `archived?: boolean` is — absence
   * here means "not yet configured" (a genuinely distinct state from an
   * explicitly-saved empty list, i.e. "deliberately granted to no
   * role"), which matters for a permission-flavored field the way it
   * wouldn't for a boolean flag. Optional rather than backfilled onto
   * SAMPLE_KNOWLEDGE_BASES and every existing test fixture, same
   * mechanical-update-avoidance reasoning `archived?` already
   * established. A plain `Role[]` (not `Role[] | "all"` the way
   * lib/knowledge-scopes.ts's KnowledgeScopeOption models a static
   * config table) — mirrors ConversationSummary.knowledgeScopes's own
   * shape instead, since this is a per-entity SELECTION being recorded,
   * not a declarative options table; "select every role individually"
   * already reaches the same "everyone" outcome through the identical
   * mechanism, without a second sentinel value to keep in sync.
   */
  visibleToRoles?: Role[];
  /**
   * E05-S007 "KB member editor". Complements S006's role-based
   * `visibleToRoles` with per-specific-person access — the common "share
   * with these people too, not just role holders" pattern. Opaque
   * identifier strings, not a `User[]`/userId-typed field: E02-S01
   * "User Entity" (Team B) doesn't exist, and packages/auth-client's
   * mock only defines 3 login fixtures for E2E authentication tests
   * (MOCK_VALID_USERNAME etc.) — not a general user directory this
   * story could legitimately treat as one. Same "no real entity
   * directory, so don't fake a picker" reasoning
   * updateKnowledgeBaseVisibleRoles's own doc comment already applies to
   * DEPARTMENT/GROUP/PROJECT/USER-scoped ACL targets. Optional, same
   * "absence means not-yet-configured, distinct from an explicit empty
   * list" reasoning as `visibleToRoles`.
   */
  members?: string[];
  /**
   * E05-S008 "KB prompt binding UI". A REFERENCE to a separate Prompt
   * entity (matching this codebase's real eventual architecture — the
   * admin-managed "8. 系統核心體驗" bullet list SOURCE_BASELINE.md
   * documents alongside User/Role/KB/Model, owned by E11-S12 "Prompt
   * Admin" (Team A, not yet built) and executed by E12 "Model & Prompt
   * Platform" (Team B, not yet built)) isn't buildable yet — same
   * "no real entity directory, so don't fake a picker" reasoning
   * `members` above already applies to a missing User directory. This
   * story instead binds the prompt TEXT directly to the knowledge base
   * as its own property — "binding" here means "this KB carries its own
   * custom instructions," not "this KB references entity #N in a
   * catalog that doesn't exist yet." Optional, same "absence means
   * not-yet-configured" reasoning as `visibleToRoles`/`members` — an
   * explicitly-saved empty string is a valid, meaningful "no custom
   * prompt, fall back to the platform default" state, not an error.
   */
  boundPrompt?: string;
}

/**
 * E05-S001: the full knowledge base list. Placeholder data source — NOT
 * the real knowledge base contract. Knowledge base entities belong to
 * E06 (Team B, Knowledge Ingestion & Indexing), which doesn't exist yet;
 * contracts/openapi/core.yaml has no paths for it — same "local mock
 * until the owning domain's contract exists" precedent E03's
 * lib/conversations.ts already established for E04.
 *
 * Fields deliberately minimal, mirroring lib/conversations.ts's own
 * ORIGINAL E03-S001 shape (id/title/preview/timestamp) rather than its
 * current, much-accreted one — SOURCE_BASELINE.md's E05 outline gives
 * List (S01), Search (S02), Create (S03), Edit (S04), and Detail (S05)
 * each their own separate story (unlike E03-S001, which bundled list
 * and create together), so this story adds only what a bare list needs:
 * `name` + `description` (the content-preview equivalent of
 * ConversationSummary.lastMessagePreview) + `updatedAt` (the recency
 * signal, meaningful once upload stories S11+ exist). No document count
 * or other summary stat — E05-S10 "KB Document List" is its own later
 * story for a knowledge base's actual document contents; inventing a
 * summary figure here would be reaching ahead of what this story's own
 * title asks for.
 */
const SAMPLE_KNOWLEDGE_BASES: KnowledgeBaseSummary[] = [
  {
    id: "kb-sample-1",
    name: "產品保固政策",
    description: "保固期限、涵蓋範圍與理賠流程等相關文件。",
    updatedAt: "2026-08-13T01:00:00.000Z",
  },
  {
    id: "kb-sample-2",
    name: "設備維修標準作業程序",
    description: "常見設備故障排除步驟與維修 SOP 文件集。",
    updatedAt: "2026-08-11T06:30:00.000Z",
  },
  {
    id: "kb-sample-3",
    name: "人力資源與請假規範",
    description: "請假、加班、差旅申請等人資相關政策文件。",
    updatedAt: "2026-08-09T02:15:00.000Z",
  },
];

const STORAGE_KEY = "ai-km:mock-knowledge-bases";

/**
 * sessionStorage-backed, not a plain module-level variable — same
 * cross-page-chunk survival reasoning as lib/conversations.ts's own
 * readStore(): this module will be imported from multiple independently
 * loaded routes as E05 grows (this list page now, detail/create/edit
 * pages in later stories), so a plain in-memory array wouldn't reliably
 * survive navigating between them.
 */
function readStore(): KnowledgeBaseSummary[] {
  if (typeof window === "undefined") return SAMPLE_KNOWLEDGE_BASES;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return SAMPLE_KNOWLEDGE_BASES;
  try {
    return JSON.parse(raw) as KnowledgeBaseSummary[];
  } catch {
    return SAMPLE_KNOWLEDGE_BASES;
  }
}

function writeStore(items: KnowledgeBaseSummary[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * E05-S002 "Knowledge search/filter". SOURCE_BASELINE.md gives this
 * story only its title ("E05-S02 Knowledge Search"); the epic file's
 * own expanded title adds "/filter" — read as the same single
 * mechanism (a search that filters the list), not a second, distinct
 * filter dimension: KnowledgeBaseSummary (E05-S001) has no category/tag
 * field yet for any OTHER kind of filter to apply to, and no
 * SOURCE_BASELINE/epic content suggests one exists.
 *
 * Same design as E03-S023 "Conversation search"'s listConversations():
 * an empty/whitespace-only query is "no search" (returns everything),
 * matching the pre-S002 call site unchanged; matches against `name`
 * only, not `description` — mirrors ConversationSummary's own
 * title-only (not lastMessagePreview) search scope, same "real product
 * sidebar search matches names, not full content" precedent. No
 * debounce — this is an in-memory array filter with no real network
 * latency to debounce against.
 *
 * No pagination added here — unlike E03 (where S022 Pagination and
 * S023 Search are two separate stories), SOURCE_BASELINE's E05 outline
 * (S01-S28) has no dedicated pagination story at all; adding one now
 * would be inventing a capability neither SOURCE_BASELINE nor this
 * story's own title asks for.
 */
export async function listKnowledgeBases(query?: string): Promise<Result<KnowledgeBaseSummary[], ApiError>> {
  const trimmedQuery = query?.trim() ?? "";
  const all = readStore();
  const filtered = trimmedQuery
    ? all.filter((item) => item.name.toLocaleLowerCase().includes(trimmedQuery.toLocaleLowerCase()))
    : all;
  return { ok: true, value: filtered };
}

/**
 * E05-S003 "Create KB form". Unlike lib/conversations.ts's
 * createConversation() (which takes no arguments and defaults
 * `title: "新對話"`), this story's own name names a "form" — and unlike a
 * disposable per-message conversation thread, a knowledge base is a
 * longer-lived organizational container users pick out by name, so a
 * list of several identically-named "新知識庫" entries would actually be
 * confusing rather than harmless. `name` is therefore real required
 * user input, fail-closed with VALIDATION_ERROR when blank — same
 * server-validates-too precedent as renameConversation(). `description`
 * is optional (defaults to "" when omitted/blank): nothing in
 * SOURCE_BASELINE or the epic template's AC requires it, and
 * KnowledgeBaseSummary.description being a non-optional `string` (not
 * `string | undefined`) is satisfied by "" same as any other field.
 *
 * Prepends to the store (same as createConversation()) so the new
 * knowledge base immediately appears at the top of listKnowledgeBases().
 * No uniqueness check against existing names — neither
 * createConversation() nor renameConversation() enforce uniqueness on
 * their own identity field either, and nothing in this story's AC asks
 * for it.
 */
export async function createKnowledgeBase(
  name: string,
  description?: string,
): Promise<Result<KnowledgeBaseSummary, ApiError>> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "知識庫名稱不得為空。" } };
  }

  const knowledgeBase: KnowledgeBaseSummary = {
    id: crypto.randomUUID(),
    name: trimmedName,
    description: description?.trim() ?? "",
    updatedAt: new Date().toISOString(),
  };
  writeStore([knowledgeBase, ...readStore()]);
  return { ok: true, value: knowledgeBase };
}

/**
 * E05-S004 "Edit KB metadata". `value: null` (not an error) when the id
 * doesn't match anything — "not found" is an expected outcome to render
 * distinctly, not a dependency failure — same modeling as
 * lib/conversations.ts's getConversation() and AuthClient.getSession().
 */
export async function getKnowledgeBase(id: string): Promise<Result<KnowledgeBaseSummary | null, ApiError>> {
  return { ok: true, value: readStore().find((item) => item.id === id) ?? null };
}

/**
 * E05-S004 "Edit KB metadata". Takes the full replacement name +
 * description together as one action (not two separate
 * setName()/setDescription() calls) — the epic's own title bundles both
 * fields into a single "metadata" edit, unlike lib/conversations.ts's
 * per-field exports (renameConversation, setConversationMode, ...), each
 * independently triggered by its own distinct UI control. Same
 * VALIDATION_ERROR-on-blank-name fail-closed rule as createKnowledgeBase
 * — a knowledge base still needs a name after being edited, same reason
 * it needed one to be created. NOT_FOUND (mirroring
 * lib/conversations.ts's updateConversation helper) when the id doesn't
 * match anything, so a caller can't mistake "already gone" for "just
 * saved it". Refreshes `updatedAt` — an edit is itself a change to the
 * record, consistent with that field's own established "recency signal"
 * meaning (see SAMPLE_KNOWLEDGE_BASES's doc comment). Preserves the
 * item's existing position in the store (via `.map()`, not
 * remove-and-prepend) — listKnowledgeBases() has never sorted by
 * `updatedAt`, and reordering the list as a side effect of an edit isn't
 * anything this story's own AC asks for.
 */
export async function updateKnowledgeBase(
  id: string,
  name: string,
  description?: string,
): Promise<Result<KnowledgeBaseSummary, ApiError>> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "知識庫名稱不得為空。" } };
  }

  const store = readStore();
  const existing = store.find((item) => item.id === id);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個知識庫。" } };
  }

  const updated: KnowledgeBaseSummary = {
    ...existing,
    name: trimmedName,
    description: description?.trim() ?? "",
    updatedAt: new Date().toISOString(),
  };
  writeStore(store.map((item) => (item.id === id ? updated : item)));
  return { ok: true, value: updated };
}

/**
 * E05-S006 "KB permission editor". Takes the complete new role list (not
 * one add/remove at a time) — same "caller reports what's checked now,
 * never diffs against the previous selection itself" reasoning
 * setConversationKnowledgeScopes() already established for an identical
 * checkbox-group shape. No VALIDATION_ERROR branch: unlike `name`,
 * `Role[]` has no "must be non-empty" rule — an empty array is a
 * meaningful, valid state (deliberately granted to no role), the same
 * way setConversationKnowledgeScopes() accepts `[]` without a validation
 * branch either. `visibleToRoles` values are plain fixed-vocabulary role
 * identifiers, not enterprise content or secrets, so — unlike
 * name/description — this module's UI callers may include them directly
 * in telemetry; this function itself does no logging.
 *
 * This module has no real enforcement point to wire this into: nothing
 * in this codebase yet performs real per-user KB retrieval that a
 * permission setting would gate (E06 Knowledge Ingestion doesn't exist).
 * This function only records the SETTING — same UX-only-visibility
 * caveat lib/knowledge-scopes.ts's own KNOWLEDGE_SCOPES table already
 * documents for its own `roles` field (Frontend/UX Boundary: "UI
 * permission hiding 只屬 UX，不可作為 security control"). Building a
 * fake enforcement layer on top of this mock (e.g. filtering
 * listKnowledgeBases() by the current user's role) would be exactly the
 * "以 mock 假裝 production path 已完成" DEVELOPMENT_POLICY forbids, so
 * this story deliberately doesn't add one — real enforcement is E02/E06
 * Team B's job once those domains exist.
 */
export async function updateKnowledgeBaseVisibleRoles(
  id: string,
  visibleToRoles: Role[],
): Promise<Result<KnowledgeBaseSummary, ApiError>> {
  const store = readStore();
  const existing = store.find((item) => item.id === id);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個知識庫。" } };
  }

  const updated: KnowledgeBaseSummary = { ...existing, visibleToRoles, updatedAt: new Date().toISOString() };
  writeStore(store.map((item) => (item.id === id ? updated : item)));
  return { ok: true, value: updated };
}

/**
 * E05-S007 "KB member editor". Takes the complete new member list (not
 * one add/remove at a time), same reasoning as
 * updateKnowledgeBaseVisibleRoles/setConversationKnowledgeScopes — the
 * caller reports what the list looks like now. Normalizes
 * (trim, drop empty, de-duplicate) rather than rejecting with
 * VALIDATION_ERROR: unlike `name`, there's no single "the input" that
 * failed validation here — this is a list-shaped field where a stray
 * blank/duplicate entry is more naturally absorbed than the whole save
 * rejected, same "defense in depth" spirit as the UI's own add-member
 * guard (see knowledge-member-editor.tsx), not a replacement for it.
 * `members` are opaque identifier strings — see this field's own doc
 * comment on KnowledgeBaseSummary for why (no real user directory
 * exists to validate against).
 */
export async function updateKnowledgeBaseMembers(
  id: string,
  members: string[],
): Promise<Result<KnowledgeBaseSummary, ApiError>> {
  const store = readStore();
  const existing = store.find((item) => item.id === id);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個知識庫。" } };
  }

  const normalizedMembers = [...new Set(members.map((member) => member.trim()).filter(Boolean))];
  const updated: KnowledgeBaseSummary = { ...existing, members: normalizedMembers, updatedAt: new Date().toISOString() };
  writeStore(store.map((item) => (item.id === id ? updated : item)));
  return { ok: true, value: updated };
}

/**
 * E05-S008 "KB prompt binding UI". Trims but never rejects with
 * VALIDATION_ERROR: an empty/whitespace-only prompt is a valid,
 * meaningful "no custom prompt bound" state — see `boundPrompt`'s own
 * doc comment on KnowledgeBaseSummary — the same "empty is meaningful,
 * not an error" precedent `visibleToRoles`/`members` already establish
 * for this story's sibling KB-configuration fields. Unlike those two,
 * this is FREE-FORM CONTENT (not a fixed-vocabulary role or a short
 * opaque identifier) — closer to `description` than to
 * `visibleToRoles`/`members` — so callers must not log the actual
 * `boundPrompt` text (see knowledge-prompt-editor.tsx's own doc
 * comment for why), the same restraint createKnowledgeBase/
 * updateKnowledgeBase already apply to `name`/`description`.
 */
export async function updateKnowledgeBaseBoundPrompt(
  id: string,
  boundPrompt: string,
): Promise<Result<KnowledgeBaseSummary, ApiError>> {
  const store = readStore();
  const existing = store.find((item) => item.id === id);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個知識庫。" } };
  }

  const updated: KnowledgeBaseSummary = { ...existing, boundPrompt: boundPrompt.trim(), updatedAt: new Date().toISOString() };
  writeStore(store.map((item) => (item.id === id ? updated : item)));
  return { ok: true, value: updated };
}
