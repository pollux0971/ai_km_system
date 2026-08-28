/**
 * Messages REST (E04-S042, contracts/openapi/conversations.yaml).
 *
 * Every route first resolves the parent conversation's ownership via
 * `lookupConversation` (403/404, same discriminated union E04-S041
 * introduced) BEFORE touching any message — a message can never be read,
 * created or revised through a conversation the caller does not own.
 */
import { randomUUID } from "node:crypto";
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
import { hostDb, hostRequireSession, requestAuth } from "../plugin-types.js";
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
 * Transcribed from `contracts/openapi/conversations.yaml`
 * `CreateMessageRequest` / `CreateRevisionRequest`, NOT pulled from
 * `app.contracts.getSchema(...)`. Same `apps/api/src/server.ts` decorator-
 * ordering issue documented in `routes/conversations.ts` (E04-S041 EVIDENCE;
 * tracked for a user decision in `docs/stories/PENDING_DECISIONS.md`) — this
 * story hits the identical constraint and uses the identical workaround.
 *
 * `attachmentNames.maxItems: 10` here matches the CONTRACT's actual cap.
 * This story's own spec text (Functional AC8) says "attachmentNames >20 個"
 * — that number does not match the frozen contract, which caps at 10. The
 * contract is the higher-authority source (CLAUDE.md 參考順位; STORY_WORKFLOW
 * "Contract 是唯一真相來源"), so the implementation follows 10, not 20; this
 * discrepancy is recorded in EVIDENCE as a spec/contract mismatch, not
 * silently reconciled.
 */
const CREATE_MESSAGE_BODY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["role", "content"],
  properties: {
    role: { type: "string", enum: ["user", "assistant"] },
    content: { type: "string", maxLength: 20000 },
    attachmentNames: {
      type: "array",
      items: { type: "string", maxLength: 255 },
      maxItems: 10,
    },
    state: { type: "string", enum: ANSWER_STATES },
  },
} as const;

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
    { preHandler: requireSession, schema: { body: CREATE_MESSAGE_BODY_SCHEMA } },
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

      const message = db.transaction(() => {
        const created = createMessage(db, owner, conversationId, {
          id,
          role: body.role,
          content: body.content,
          attachmentNames,
          ...(state ? { state } : {}),
          now,
        });
        touchConversationSummary(db, owner, conversationId, preview, now);
        appendChangeEvent(db, owner, {
          type: "message.created",
          conversationId,
          messageId: created.id,
          occurredAt: now,
          ...(originClientId ? { originClientId } : {}),
        });
        appendChangeEvent(db, owner, {
          type: "conversation.updated",
          conversationId,
          occurredAt: now,
          ...(originClientId ? { originClientId } : {}),
        });
        return created;
      })();

      void reply.status(201);
      return message;
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

      const updated = db.transaction(() => {
        const revised = createRevision(db, owner, messageId, body.content, body.state, now);
        appendChangeEvent(db, owner, {
          type: "message.updated",
          conversationId,
          messageId,
          occurredAt: now,
          ...(originClientId ? { originClientId } : {}),
        });
        return revised;
      })();

      return updated;
    },
  );
}
