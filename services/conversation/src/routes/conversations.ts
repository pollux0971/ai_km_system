/**
 * Conversations REST (E04-S041, contracts/openapi/conversations.yaml).
 *
 * Every protected route: `requireSession` first (AC9 "Authorization 先於
 * 任何讀取"), then every repository call takes `request.auth.ownerKey`,
 * never `userId` (apps/api/README.md rule #2).
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createConversation,
  deleteConversation,
  listConversations,
  lookupConversation,
  updateConversation,
  type AiModel,
  type ConversationMode,
  type KnowledgeScope,
} from "../repository/conversations.repository.js";
import { appendChangeEvent } from "../repository/change-events.repository.js";
import { toOwnerKey, type OwnerKey } from "../repository/owner-scope.js";
import { hostChangeEventBus, hostDb, hostRequireSession, requestAuth } from "../plugin-types.js";
import { ConversationDomainError } from "../domain-error.js";

/** Matches contract `servers: - url: /v1` (ADR 0003 §6). */
const PREFIX = "/v1";

const LIST_QUERYSTRING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    // Mirrors contracts/openapi/conversations.yaml `listConversations`
    // parameters exactly. Not a named contract schema component (OpenAPI
    // has no `$ref` target for inline `parameters:`), so it is transcribed
    // here rather than pulled from `app.contracts`.
    page: { type: "integer", minimum: 1, default: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 200, default: 20 },
    q: { type: "string", maxLength: 200 },
    archived: { type: "boolean", default: false },
  },
} as const;

/**
 * Transcribed from `contracts/openapi/conversations.yaml`
 * `CreateConversationRequest` / `UpdateConversationRequest`, NOT pulled from
 * `app.contracts.getSchema(...)` as apps/api/README.md's rule #3 otherwise
 * prescribes.
 *
 * Found while implementing this story (recorded in EVIDENCE, out of scope
 * to fix here): `apps/api/src/server.ts` calls
 * `await app.register(conversationPlugin)` BEFORE
 * `app.decorate("contracts", contracts)`. Fastify's `schema:` route option
 * is read synchronously while a plugin's own body executes during
 * registration, so `app.contracts` is still `undefined` at that point —
 * calling `.getSchema()` there throws `TypeError: Cannot read properties of
 * undefined`. `server.ts` is outside this story's allowed-modify list
 * (`services/conversation/**`, `db/seeds/**`), so the two decorator calls'
 * order cannot be fixed here; this transcription sidesteps it the same way
 * the querystring schema above already has to (no named component exists
 * for that one either). Contract-body compliance is instead enforced by
 * `testing/contract-check.ts`'s response assertions, run against every
 * status this story returns.
 */
const CREATE_CONVERSATION_BODY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: ["normal", "advanced"] },
  },
} as const;

const UPDATE_CONVERSATION_BODY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  minProperties: 0,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 120 },
    mode: { type: "string", enum: ["normal", "advanced"] },
    knowledgeScopes: {
      type: "array",
      items: { type: "string", enum: ["company", "department", "project", "private", "qna"] },
      uniqueItems: true,
    },
    model: { type: "string", enum: ["standard", "advanced-local", "cloud"] },
    archived: { type: "boolean" },
  },
} as const;

function ownerKeyOf(request: FastifyRequest): OwnerKey {
  const auth = requestAuth(request);
  // Unreachable in practice — requireSession always runs first and throws
  // before a handler body executes — but fail closed rather than assume.
  if (!auth) throw new ConversationDomainError(401, "請先登入。");
  return toOwnerKey(auth.ownerKey);
}

function originClientIdOf(request: FastifyRequest): string | undefined {
  const header = request.headers["x-client-id"];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

interface CreateConversationBody {
  readonly mode?: ConversationMode;
}

interface UpdateConversationBody {
  readonly title?: string;
  readonly mode?: ConversationMode;
  readonly knowledgeScopes?: KnowledgeScope[];
  readonly model?: AiModel;
  readonly archived?: boolean;
}

export function registerConversationRoutes(app: FastifyInstance): void {
  const requireSession = hostRequireSession(app);

  app.get(
    `${PREFIX}/conversations`,
    { preHandler: requireSession, schema: { querystring: LIST_QUERYSTRING_SCHEMA } },
    async (request) => {
      const owner = ownerKeyOf(request);
      const { page, pageSize, q, archived } = request.query as {
        page: number;
        pageSize: number;
        q?: string;
        archived: boolean;
      };
      return listConversations(hostDb(app), owner, { page, pageSize, q, archived });
    },
  );

  app.post(
    `${PREFIX}/conversations`,
    {
      preHandler: requireSession,
      // The contract marks this requestBody `required: false` — a caller
      // may send no body at all. Fastify still runs the body schema
      // against whatever `request.body` is, and `undefined` fails a
      // `type: object` check before defaults can even apply, so the
      // missing-body case is defaulted here, before validation runs.
      preValidation: (request, _reply, done) => {
        if (request.body === undefined) request.body = {};
        done();
      },
      schema: { body: CREATE_CONVERSATION_BODY_SCHEMA },
    },
    async (request, reply) => {
      const owner = ownerKeyOf(request);
      const body = (request.body ?? {}) as CreateConversationBody;
      const db = hostDb(app);
      const now = new Date().toISOString();
      const id = randomUUID();

      const originClientId = originClientIdOf(request);
      // E04-S044: write + event-append must be one transaction — publish()
      // below must never fire for a write that got rolled back, and there
      // is no way to know "did it commit?" without an actual transaction
      // boundary to observe.
      const { row, event } = db.transaction(() => {
        const row = createConversation(db, owner, { id, mode: body.mode ?? "normal", now });
        const event = appendChangeEvent(db, owner, {
          type: "conversation.created",
          conversationId: row.id,
          occurredAt: now,
          ...(originClientId ? { originClientId } : {}),
        });
        return { row, event };
      })();
      hostChangeEventBus(app).publish(owner, event);

      void reply.status(201);
      return row;
    },
  );

  app.get(`${PREFIX}/conversations/:conversationId`, { preHandler: requireSession }, async (request) => {
    const owner = ownerKeyOf(request);
    const { conversationId } = request.params as { conversationId: string };
    const result = lookupConversation(hostDb(app), owner, conversationId);

    if (result.outcome === "not_found") throw new ConversationDomainError(404, "找不到這筆對話。");
    if (result.outcome === "forbidden") throw new ConversationDomainError(403, "沒有存取這筆對話的權限。");
    return result.row;
  });

  app.patch(
    `${PREFIX}/conversations/:conversationId`,
    {
      preHandler: requireSession,
      schema: { body: UPDATE_CONVERSATION_BODY_SCHEMA },
    },
    async (request) => {
      const owner = ownerKeyOf(request);
      const { conversationId } = request.params as { conversationId: string };
      const db = hostDb(app);

      const lookup = lookupConversation(db, owner, conversationId);
      if (lookup.outcome === "not_found") throw new ConversationDomainError(404, "找不到這筆對話。");
      if (lookup.outcome === "forbidden") throw new ConversationDomainError(403, "沒有存取這筆對話的權限。");

      const body = (request.body ?? {}) as UpdateConversationBody;
      const patch: {
        title?: string;
        mode?: ConversationMode;
        knowledgeScopes?: KnowledgeScope[];
        model?: AiModel;
        archived?: boolean;
      } = {};

      if (body.title !== undefined) {
        // The contract's minLength:1 does not catch a whitespace-only
        // title; "trimmed before validation" (contract description) means
        // THIS check, not the JSON schema, is what AC6 actually requires.
        const trimmed = body.title.trim();
        if (trimmed === "") throw new ConversationDomainError(400, "對話名稱不得為空。");
        patch.title = trimmed;
      }
      if (body.mode !== undefined) patch.mode = body.mode;
      if (body.knowledgeScopes !== undefined) patch.knowledgeScopes = body.knowledgeScopes;
      if (body.model !== undefined) patch.model = body.model;
      if (body.archived !== undefined) patch.archived = body.archived;

      // ASSUMPTION (recorded in EVIDENCE): an empty body is treated as a
      // true no-op — no write, no updatedAt bump, no change event — per the
      // contract's "Sending an empty object is a no-op update and still
      // returns the current conversation."
      if (Object.keys(patch).length === 0) return lookup.row;

      const now = new Date().toISOString();
      const originClientId = originClientIdOf(request);
      const { updated, event } = db.transaction(() => {
        const updated = updateConversation(db, owner, conversationId, patch, now);
        const event = appendChangeEvent(db, owner, {
          type: "conversation.updated",
          conversationId,
          occurredAt: now,
          ...(originClientId ? { originClientId } : {}),
        });
        return { updated, event };
      })();
      hostChangeEventBus(app).publish(owner, event);
      return updated;
    },
  );

  app.delete(
    `${PREFIX}/conversations/:conversationId`,
    { preHandler: requireSession },
    async (request, reply) => {
      const owner = ownerKeyOf(request);
      const { conversationId } = request.params as { conversationId: string };
      const db = hostDb(app);

      const lookup = lookupConversation(db, owner, conversationId);
      if (lookup.outcome === "not_found") throw new ConversationDomainError(404, "找不到這筆對話。");
      if (lookup.outcome === "forbidden") throw new ConversationDomainError(403, "沒有存取這筆對話的權限。");

      const now = new Date().toISOString();
      const originClientId = originClientIdOf(request);
      const event = db.transaction(() => {
        deleteConversation(db, owner, conversationId);
        return appendChangeEvent(db, owner, {
          type: "conversation.deleted",
          conversationId,
          occurredAt: now,
          ...(originClientId ? { originClientId } : {}),
        });
      })();
      hostChangeEventBus(app).publish(owner, event);

      void reply.status(204);
    },
  );
}
