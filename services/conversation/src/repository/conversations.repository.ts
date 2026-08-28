/**
 * Conversations repository (E04-S041, contracts/openapi/conversations.yaml).
 *
 * Every read/write goes through `prepareOwnerScoped` (E04-S040 AC7) except
 * the one deliberate exception in `lookupConversation` — see its own comment
 * for why a 403-vs-404 split needs to see a row's `owner_key` before it can
 * even answer "does this exist".
 */
import type { Database } from "better-sqlite3";
import { prepareOwnerScoped, toOwnerKey, type OwnerKey } from "./owner-scope.js";

export type ConversationMode = "normal" | "advanced";
export type AiModel = "standard" | "advanced-local" | "cloud";
export type KnowledgeScope = "company" | "department" | "project" | "private" | "qna";

export interface ConversationRow {
  readonly id: string;
  readonly title: string;
  readonly mode: ConversationMode;
  readonly knowledgeScopes: KnowledgeScope[];
  readonly model: AiModel;
  readonly archived: boolean;
  readonly lastMessageAt: string;
  readonly lastMessagePreview: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface RawConversationRow {
  id: string;
  owner_key: string;
  title: string;
  mode: ConversationMode;
  knowledge_scopes: string;
  model: AiModel;
  archived: 0 | 1;
  last_message_at: string;
  last_message_preview: string;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = `id, owner_key, title, mode, knowledge_scopes, model, archived,
       last_message_at, last_message_preview, created_at, updated_at`;

function toConversation(raw: RawConversationRow): ConversationRow {
  return {
    id: raw.id,
    title: raw.title,
    mode: raw.mode,
    knowledgeScopes: JSON.parse(raw.knowledge_scopes) as KnowledgeScope[],
    model: raw.model,
    archived: raw.archived === 1,
    lastMessageAt: raw.last_message_at,
    lastMessagePreview: raw.last_message_preview,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

/** Server-assigned defaults, matching contracts/openapi/conversations.yaml `createConversation`. */
export const DEFAULT_CONVERSATION_TITLE = "新對話";
export const DEFAULT_CONVERSATION_PREVIEW = "尚無訊息。";
export const DEFAULT_CONVERSATION_MODEL: AiModel = "standard";

export interface CreateConversationInput {
  readonly id: string;
  readonly mode: ConversationMode;
  /** ISO-8601 UTC. Caller-supplied so the repository stays a pure function of its inputs. */
  readonly now: string;
}

export function createConversation(
  db: Database,
  ownerKey: OwnerKey,
  input: CreateConversationInput,
): ConversationRow {
  const owner = toOwnerKey(ownerKey);
  const raw: RawConversationRow = {
    id: input.id,
    owner_key: owner,
    title: DEFAULT_CONVERSATION_TITLE,
    mode: input.mode,
    knowledge_scopes: "[]",
    model: DEFAULT_CONVERSATION_MODEL,
    archived: 0,
    last_message_at: input.now,
    last_message_preview: DEFAULT_CONVERSATION_PREVIEW,
    created_at: input.now,
    updated_at: input.now,
  };

  prepareOwnerScoped(
    db,
    `INSERT INTO conversations
       (id, owner_key, title, mode, knowledge_scopes, model, archived, last_message_at, last_message_preview, created_at, updated_at)
     VALUES (@id, @owner_key, @title, @mode, @knowledge_scopes, @model, @archived, @last_message_at, @last_message_preview, @created_at, @updated_at)`,
  ).run(raw);

  return toConversation(raw);
}

export type ConversationLookupResult =
  | { readonly outcome: "found"; readonly row: ConversationRow }
  | { readonly outcome: "forbidden" }
  | { readonly outcome: "not_found" };

/**
 * Looks up one conversation by id and decides 403 vs 404 vs 200 (AC9).
 *
 * The initial read is DELIBERATELY not owner-scoped: telling a "not yours"
 * 403 apart from a genuine 404 requires seeing whose row it is BEFORE we
 * know whether the caller may be told it exists at all. That is a one-row,
 * single-id lookup — never a list — and only the "found" branch (where the
 * ownership check has already passed) ever hands the row back to a caller.
 */
export function lookupConversation(db: Database, ownerKey: OwnerKey, id: string): ConversationLookupResult {
  const owner = toOwnerKey(ownerKey);
  const raw = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM conversations WHERE id = ?`)
    .get(id) as RawConversationRow | undefined;

  if (!raw) return { outcome: "not_found" };
  if (raw.owner_key !== owner) return { outcome: "forbidden" };
  return { outcome: "found", row: toConversation(raw) };
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export interface ListConversationsOptions {
  readonly page: number;
  readonly pageSize: number;
  readonly q?: string;
  readonly archived: boolean;
}

export interface ConversationListPage {
  readonly items: ConversationRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages: number;
}

/**
 * `archived` is a SWITCH between two mutually exclusive views, not an
 * "also include" toggle — `totalCount`/`totalPages` always describe the
 * view actually requested (contract, `listConversations` description).
 */
export function listConversations(
  db: Database,
  ownerKey: OwnerKey,
  options: ListConversationsOptions,
): ConversationListPage {
  const owner = toOwnerKey(ownerKey);
  const trimmedQ = options.q?.trim() ?? "";
  const archivedFlag = options.archived ? 1 : 0;

  const whereParts = ["owner_key = @owner_key", "archived = @archived"];
  const params: Record<string, unknown> = { owner_key: owner, archived: archivedFlag };
  if (trimmedQ) {
    whereParts.push("LOWER(title) LIKE LOWER(@q) ESCAPE '\\'");
    params.q = `%${escapeLikePattern(trimmedQ)}%`;
  }
  const where = whereParts.join(" AND ");

  const totalCount = (
    prepareOwnerScoped(db, `SELECT COUNT(*) AS n FROM conversations WHERE ${where}`).get(params) as {
      n: number;
    }
  ).n;
  const totalPages = Math.max(1, Math.ceil(totalCount / options.pageSize));
  const safePage = Math.max(1, options.page);
  const offset = (safePage - 1) * options.pageSize;

  const rows = prepareOwnerScoped(
    db,
    `SELECT ${SELECT_COLUMNS} FROM conversations WHERE ${where}
     ORDER BY last_message_at DESC, created_at DESC, id ASC
     LIMIT @limit OFFSET @offset`,
  ).all({ ...params, limit: options.pageSize, offset }) as RawConversationRow[];

  return {
    items: rows.map(toConversation),
    page: safePage,
    pageSize: options.pageSize,
    totalCount,
    totalPages,
  };
}

export interface UpdateConversationPatch {
  readonly title?: string;
  readonly mode?: ConversationMode;
  readonly knowledgeScopes?: KnowledgeScope[];
  readonly model?: AiModel;
  readonly archived?: boolean;
}

/**
 * Applies a partial update. Callers must have already resolved
 * `lookupConversation` to `"found"` for this (ownerKey, id) — this function
 * re-scopes the WHERE anyway (defence in depth) but does not itself decide
 * 403/404.
 */
export function updateConversation(
  db: Database,
  ownerKey: OwnerKey,
  id: string,
  patch: UpdateConversationPatch,
  now: string,
): ConversationRow {
  const owner = toOwnerKey(ownerKey);
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, owner_key: owner, updated_at: now };

  if (patch.title !== undefined) {
    sets.push("title = @title");
    params.title = patch.title;
  }
  if (patch.mode !== undefined) {
    sets.push("mode = @mode");
    params.mode = patch.mode;
  }
  if (patch.knowledgeScopes !== undefined) {
    sets.push("knowledge_scopes = @knowledge_scopes");
    params.knowledge_scopes = JSON.stringify(patch.knowledgeScopes);
  }
  if (patch.model !== undefined) {
    sets.push("model = @model");
    params.model = patch.model;
  }
  if (patch.archived !== undefined) {
    sets.push("archived = @archived");
    params.archived = patch.archived ? 1 : 0;
  }
  sets.push("updated_at = @updated_at");

  prepareOwnerScoped(
    db,
    `UPDATE conversations SET ${sets.join(", ")} WHERE id = @id AND owner_key = @owner_key`,
  ).run(params);

  const raw = prepareOwnerScoped(
    db,
    `SELECT ${SELECT_COLUMNS} FROM conversations WHERE id = @id AND owner_key = @owner_key`,
  ).get(params) as RawConversationRow;

  return toConversation(raw);
}

/**
 * Scoped delete only — cascades to `messages` via the schema's
 * `ON DELETE CASCADE` (E04-S040). Callers must have already resolved
 * `lookupConversation` to `"found"`.
 */
export function deleteConversation(db: Database, ownerKey: OwnerKey, id: string): void {
  const owner = toOwnerKey(ownerKey);
  prepareOwnerScoped(db, `DELETE FROM conversations WHERE id = ? AND owner_key = ?`).run(id, owner);
}
