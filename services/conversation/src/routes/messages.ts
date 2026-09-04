/**
 * Messages REST (E04-S042, contracts/openapi/conversations.yaml).
 *
 * Every route first resolves the parent conversation's ownership via
 * `lookupConversation` (403/404, same discriminated union E04-S041
 * introduced) BEFORE touching any message — a message can never be read,
 * created or revised through a conversation the caller does not own.
 */
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { lookupConversation } from "../repository/conversations.repository.js";
import {
  createMessage,
  createRevision,
  getMessage,
  listMessages,
  touchConversationSummary,
  type AnswerState,
  type MessageRole,
} from "../repository/messages.repository.js";
import { appendChangeEvent } from "../repository/change-events.repository.js";
import { toOwnerKey, type OwnerKey } from "../repository/owner-scope.js";
import {
  hostChangeEventBus,
  hostContracts,
  hostDb,
  hostRag,
  hostRequireSession,
  requestAuth,
  type ConversationAuthContext,
} from "../plugin-types.js";
import { ConversationDomainError } from "../domain-error.js";

const PREFIX = "/v1";

const ANSWER_STATES = [
  "ANSWERED",
  "PARTIAL",
  "NO_EVIDENCE",
  "ERROR",
  "PERMISSION_DENIED",
  "SOURCE_UNAVAILABLE",
] as const;

/**
 * `attachmentNames.maxItems: 10` matches the CONTRACT's actual cap.
 * This story's own spec text (Functional AC8) says "attachmentNames >20 個"
 * — that number does not match the frozen contract, which caps at 10. The
 * contract is the higher-authority source (CLAUDE.md 參考順位; STORY_WORKFLOW
 * "Contract 是唯一真相來源"), so the implementation follows 10, not 20; this
 * discrepancy is recorded in EVIDENCE as a spec/contract mismatch, not
 * silently reconciled.
 *
 * `CreateRevisionRequest` is still transcribed from `contracts/openapi/
 * conversations.yaml`, NOT pulled from `app.contracts.getSchema(...)`.
 * `CreateMessageRequest` below WAS transcribed for the same reason
 * (`conversationPlugin` used to register unconditionally in
 * `apps/api/src/server.ts`, so a route calling `getSchema("conversations",
 * ...)` at registration time threw under `apps/api`'s fixture-only bootstrap
 * tests) — E04-S050 made that registration conditional on
 * `contracts.specNames().includes("conversations")`, so this one route now
 * pulls its schema from the real contract to prove the mechanism works.
 * Converting `CreateRevisionRequest` too is explicitly Scope Out for
 * E04-S050 (only one conversion is required); left transcribed here.
 */
const CREATE_REVISION_BODY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["content"],
  properties: {
    content: { type: "string", minLength: 1, maxLength: 20000 },
    state: { type: "string", enum: ANSWER_STATES },
  },
} as const;

function ownerKeyOf(request: FastifyRequest): OwnerKey {
  const auth = requestAuth(request);
  if (!auth) throw new ConversationDomainError(401, "請先登入。");
  return toOwnerKey(auth.ownerKey);
}

function originClientIdOf(request: FastifyRequest): string | undefined {
  const header = request.headers["x-client-id"];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

interface CreateMessageBody {
  readonly role: MessageRole;
  readonly content: string;
  readonly attachmentNames?: string[];
  readonly state?: AnswerState;
}

interface CreateRevisionBody {
  readonly content: string;
  readonly state?: AnswerState;
}

/**
 * 03-conversation/phase-2 (I2, ADR 0014/0016): runs the RAG round-trip for a
 * just-posted `role: user` question and appends the grounded `role:
 * assistant` reply as a second message — same shape (createMessage →
 * touchConversationSummary → 2 appendChangeEvent → 2 bus.publish) the
 * `role: user` path just used, so a watching SSE window and the change log
 * see the assistant's reply exactly like any other message write.
 *
 * `app.rag` only exists once `apps/api`'s real `buildServer()` has
 * registered `ragPlugin` — the bare `buildTestApp()` harness this package's
 * own vitest suite uses never does (see `hostRag`'s doc comment). Read here,
 * at CALL time inside the request handler, not hoisted into a
 * module/registration-time constant: `conversationPlugin` is registered
 * BEFORE `ragPlugin` in `apps/api/src/server.ts` (06-retrieval/07-generation/
 * this domain's own ordering — E04-S049), so a value captured once at
 * `registerMessageRoutes()`'s own call time would permanently see
 * `undefined` — the exact bug `hostRequireSession`'s doc comment already
 * describes for a different decorator. Callers of this function that skip
 * it (bare harness, no rag) leave `POST .../messages` byte-for-byte
 * unchanged from phase-1.
 *
 * `caller.principalId` carries the ASKER's own identity into
 * `app.rag.ask()` — ADR 0014's fixed `dept:eng` permission itself is
 * unchanged (still lives entirely inside `apps/api/src/rag-plugin.ts`; this
 * function never sees or threads a scope key), but the days of every
 * signed-in person's question flowing through the exact same anonymous call
 * are over: this is the first production caller that has a real person to
 * hand `ask()`.
 */
async function triggerRagReply(
  app: FastifyInstance,
  db: Database,
  owner: OwnerKey,
  conversationId: string,
  question: string,
  auth: ConversationAuthContext,
): Promise<void> {
  const rag = hostRag(app);
  if (!rag) return;

  const answer = await rag.ask(question, { principalId: auth.userId });
  const preview = answer.answer.length > 0 ? answer.answer : `已傳送 0 個附件`;
  const id = randomUUID();
  const now = new Date().toISOString();

  const { messageCreatedEvent, conversationUpdatedEvent } = db.transaction(() => {
    createMessage(db, owner, conversationId, {
      id,
      role: "assistant",
      content: answer.answer,
      attachmentNames: [],
      // No `state` — deliberately (technical-advisor review). `state` must
      // be driven by generation's own STRUCTURED result (≥1 citation →
      // ANSWERED, a structured abstention → NO_EVIDENCE, a provider error →
      // ERROR, scope-narrowed-to-empty → NO_EVIDENCE never
      // PERMISSION_DENIED — 鐵律 #2, that would leak "something was
      // denied"). `07-generation` has no structured-abstention signal today
      // (that is its own phase-3, ADR 0013 #12 — decided, not yet landed),
      // so ANSWERED vs. NO_EVIDENCE cannot actually be told apart from
      // `answer.citations.length` alone — an earlier revision of this file
      // guessed `citations.length > 0 ? "ANSWERED" : "NO_EVIDENCE"`, which is
      // exactly the mistake this comment is here to not repeat: that guess
      // treats a RESULT's side effect (whether citations happened to come
      // back) as if it were the result itself. `state` is OPTIONAL in the
      // contract (`Message.required` has no `state`), so omitting it here is
      // honest — an absent `state` says "unknown", a guessed-right `state`
      // would look identical in every test today while quietly telling the
      // next reader there was a real basis for it. Fill this in once
      // `07-generation` actually returns a structured verdict.
      citations: answer.citations,
      now,
    });
    touchConversationSummary(db, owner, conversationId, preview, now);
    const messageCreatedEvent = appendChangeEvent(db, owner, {
      type: "message.created",
      conversationId,
      messageId: id,
      occurredAt: now,
    });
    const conversationUpdatedEvent = appendChangeEvent(db, owner, {
      type: "conversation.updated",
      conversationId,
      occurredAt: now,
    });
    return { messageCreatedEvent, conversationUpdatedEvent };
  })();

  const bus = hostChangeEventBus(app);
  bus.publish(owner, messageCreatedEvent);
  bus.publish(owner, conversationUpdatedEvent);
}

export function registerMessageRoutes(app: FastifyInstance): void {
  const requireSession = hostRequireSession(app);

  app.get(
    `${PREFIX}/conversations/:conversationId/messages`,
    { preHandler: requireSession },
    async (request) => {
      const owner = ownerKeyOf(request);
      const { conversationId } = request.params as { conversationId: string };
      const db = hostDb(app);

      const lookup = lookupConversation(db, owner, conversationId);
      if (lookup.outcome === "not_found") throw new ConversationDomainError(404, "找不到這筆對話。");
      if (lookup.outcome === "forbidden") throw new ConversationDomainError(403, "沒有存取這筆對話的權限。");

      return listMessages(db, owner, conversationId);
    },
  );

  app.post(
    `${PREFIX}/conversations/:conversationId/messages`,
    {
      preHandler: requireSession,
      schema: { body: hostContracts(app).getSchema("conversations", "CreateMessageRequest") },
    },
    async (request, reply) => {
      const owner = ownerKeyOf(request);
      const { conversationId } = request.params as { conversationId: string };
      const db = hostDb(app);

      const lookup = lookupConversation(db, owner, conversationId);
      if (lookup.outcome === "not_found") throw new ConversationDomainError(404, "找不到這筆對話。");
      if (lookup.outcome === "forbidden") throw new ConversationDomainError(403, "沒有存取這筆對話的權限。");

      const body = request.body as CreateMessageBody;
      const attachmentNames = body.attachmentNames ?? [];

      if (body.content.length === 0 && attachmentNames.length === 0) {
        throw new ConversationDomainError(400, "訊息內容或附件至少需有一項。");
      }
      if (body.role === "user" && body.state !== undefined) {
        throw new ConversationDomainError(400, "使用者訊息不得帶有 state。");
      }
      if (body.role === "assistant" && attachmentNames.length > 0) {
        throw new ConversationDomainError(400, "AI 回答不得帶有附件。");
      }

      const state = body.role === "assistant" ? (body.state ?? "ANSWERED") : undefined;
      const id = randomUUID();
      const now = new Date().toISOString();
      const preview = body.content.length > 0 ? body.content : `已傳送 ${attachmentNames.length} 個附件`;
      const originClientId = originClientIdOf(request);

      const { created, messageCreatedEvent, conversationUpdatedEvent } = db.transaction(() => {
        const created = createMessage(db, owner, conversationId, {
          id,
          role: body.role,
          content: body.content,
          attachmentNames,
          ...(state ? { state } : {}),
          now,
        });
        touchConversationSummary(db, owner, conversationId, preview, now);
        const messageCreatedEvent = appendChangeEvent(db, owner, {
          type: "message.created",
          conversationId,
          messageId: created.id,
          occurredAt: now,
          ...(originClientId ? { originClientId } : {}),
        });
        const conversationUpdatedEvent = appendChangeEvent(db, owner, {
          type: "conversation.updated",
          conversationId,
          occurredAt: now,
          ...(originClientId ? { originClientId } : {}),
        });
        return { created, messageCreatedEvent, conversationUpdatedEvent };
      })();
      const bus = hostChangeEventBus(app);
      bus.publish(owner, messageCreatedEvent);
      bus.publish(owner, conversationUpdatedEvent);

      // 03-conversation/phase-2 (I2): a question the asker just posted is
      // answered synchronously, before this response returns (design
      // judgement A, features/03-conversation/phase-2.feature's header —
      // the scenarios poll the conversation's message list either way, so
      // sync vs. async is this route's own choice, not the spec's). Only
      // for the asker's own question, only when there is question TEXT to
      // ask (an attachment-only message, `content: ""`, has nothing for
      // `retrieve()` to search — calling `ask("")` would throw the same
      // empty-question guard `07-generation/phase-2` already exercises,
      // which is the right behaviour for a real question but would turn an
      // otherwise-valid attachment-only message into a 500), and only when
      // `app.rag` actually exists (see `triggerRagReply`'s doc comment) — an
      // assistant message posted directly (the pre-I2, still-supported
      // path) never re-triggers RAG on itself.
      if (body.role === "user" && body.content.length > 0) {
        await triggerRagReply(app, db, owner, conversationId, body.content, requestAuth(request)!);
      }

      void reply.status(201);
      return created;
    },
  );

  app.post(
    `${PREFIX}/conversations/:conversationId/messages/:messageId/revisions`,
    { preHandler: requireSession, schema: { body: CREATE_REVISION_BODY_SCHEMA } },
    async (request) => {
      const owner = ownerKeyOf(request);
      const { conversationId, messageId } = request.params as {
        conversationId: string;
        messageId: string;
      };
      const db = hostDb(app);

      const lookup = lookupConversation(db, owner, conversationId);
      if (lookup.outcome === "not_found") throw new ConversationDomainError(404, "找不到這筆對話。");
      if (lookup.outcome === "forbidden") throw new ConversationDomainError(403, "沒有存取這筆對話的權限。");

      const existing = getMessage(db, owner, conversationId, messageId);
      if (!existing) throw new ConversationDomainError(404, "找不到這則訊息。");
      if (existing.role !== "assistant") {
        throw new ConversationDomainError(400, "只能修訂 AI 回答訊息。");
      }

      const body = request.body as CreateRevisionBody;
      const now = new Date().toISOString();
      const originClientId = originClientIdOf(request);

      const { revised, event } = db.transaction(() => {
        const revised = createRevision(db, owner, messageId, body.content, body.state, now);
        const event = appendChangeEvent(db, owner, {
          type: "message.updated",
          conversationId,
          messageId,
          occurredAt: now,
          ...(originClientId ? { originClientId } : {}),
        });
        return { revised, event };
      })();
      hostChangeEventBus(app).publish(owner, event);

      return revised;
    },
  );
}
