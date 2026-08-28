/**
 * Message feedback REST (E04-S043, contracts/openapi/conversations.yaml).
 *
 * Every route: `requireSession` → `lookupConversation` (403/404) →
 * `getMessage` (404 if missing/wrong conversation) → role-must-be-assistant
 * (400) → endpoint-specific precondition (400) → write → `message.updated`
 * event. Mirrors the fail-closed rules `apps/web/src/lib/messages.ts`'s
 * `submitAnswerFeedback`/`submitFeedbackReason`/`submitFeedbackComment`/
 * `submitCitationFeedback` already established client-side (E13-S001~S005),
 * now enforced server-side since messages persist here (E04-S042).
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { lookupConversation } from "../repository/conversations.repository.js";
import { getMessage, type AnswerFeedbackVerdict, type FeedbackReason } from "../repository/messages.repository.js";
import {
  extractCitationIds,
  setCitationFeedback,
  setFeedbackComment,
  setFeedbackReason,
  setFeedbackVerdict,
} from "../repository/message-feedback.repository.js";
import { appendChangeEvent } from "../repository/change-events.repository.js";
import { toOwnerKey, type OwnerKey } from "../repository/owner-scope.js";
import { hostChangeEventBus, hostDb, hostRequireSession, requestAuth } from "../plugin-types.js";
import { ConversationDomainError } from "../domain-error.js";

const PREFIX = "/v1";

/**
 * Transcribed from the contract, not pulled from `app.contracts.getSchema
 * (...)` — same two independent reasons `routes/messages.ts` (E04-S042)
 * documents: the E04-S041-era decorator-ordering bug (fixed by E04-S049) and
 * the still-open apps/api fixture-isolation gap that makes calling
 * `getSchema()` at route-registration time break `apps/api`'s own
 * fixture-based tests. See that file's comment for the full account.
 */
const SET_FEEDBACK_BODY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict"],
  properties: {
    verdict: { type: "string", enum: ["OK", "NG"] },
  },
} as const;

const SET_FEEDBACK_REASON_BODY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reason"],
  properties: {
    reason: { type: "string", enum: ["INCORRECT", "INCOMPLETE", "OFF_TOPIC", "OTHER"] },
  },
} as const;

const SET_FEEDBACK_COMMENT_BODY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["comment"],
  properties: {
    comment: { type: "string", minLength: 1, maxLength: 500 },
  },
} as const;

function ownerKeyOf(request: FastifyRequest): OwnerKey {
  const auth = requestAuth(request);
  if (!auth) throw new ConversationDomainError(401, "請先登入。");
  return toOwnerKey(auth.ownerKey);
}

/**
 * Shared preamble for all 4 routes: resolves conversation ownership, then
 * the message itself, then the "only assistant messages" rule every
 * feedback dimension shares (AC5). Returns the message so callers can read
 * its current feedback state / content for their own precondition.
 */
function resolveAssistantMessage(
  app: FastifyInstance,
  owner: OwnerKey,
  conversationId: string,
  messageId: string,
) {
  const db = hostDb(app);
  const lookup = lookupConversation(db, owner, conversationId);
  if (lookup.outcome === "not_found") throw new ConversationDomainError(404, "找不到這筆對話。");
  if (lookup.outcome === "forbidden") throw new ConversationDomainError(403, "沒有存取這筆對話的權限。");

  const message = getMessage(db, owner, conversationId, messageId);
  if (!message) throw new ConversationDomainError(404, "找不到這則訊息。");
  if (message.role !== "assistant") {
    throw new ConversationDomainError(400, "只能對 AI 回答提供回饋。");
  }
  return { db, message };
}

export function registerMessageFeedbackRoutes(app: FastifyInstance): void {
  const requireSession = hostRequireSession(app);

  app.put(
    `${PREFIX}/conversations/:conversationId/messages/:messageId/feedback`,
    { preHandler: requireSession, schema: { body: SET_FEEDBACK_BODY_SCHEMA } },
    async (request) => {
      const owner = ownerKeyOf(request);
      const { conversationId, messageId } = request.params as { conversationId: string; messageId: string };
      const { db } = resolveAssistantMessage(app, owner, conversationId, messageId);

      const { verdict } = request.body as { verdict: AnswerFeedbackVerdict };
      const now = new Date().toISOString();
      const { updated, event } = db.transaction(() => {
        const updated = setFeedbackVerdict(db, owner, messageId, verdict, now);
        const event = appendChangeEvent(db, owner, { type: "message.updated", conversationId, messageId, occurredAt: now });
        return { updated, event };
      })();
      hostChangeEventBus(app).publish(owner, event);
      return updated;
    },
  );

  app.put(
    `${PREFIX}/conversations/:conversationId/messages/:messageId/feedback/reason`,
    { preHandler: requireSession, schema: { body: SET_FEEDBACK_REASON_BODY_SCHEMA } },
    async (request) => {
      const owner = ownerKeyOf(request);
      const { conversationId, messageId } = request.params as { conversationId: string; messageId: string };
      const { db, message } = resolveAssistantMessage(app, owner, conversationId, messageId);

      if (message.feedback !== "NG") {
        throw new ConversationDomainError(400, "只能為「沒有幫助」的回饋選擇原因。");
      }

      const { reason } = request.body as { reason: FeedbackReason };
      const now = new Date().toISOString();
      const { updated, event } = db.transaction(() => {
        const updated = setFeedbackReason(db, owner, messageId, reason, now);
        const event = appendChangeEvent(db, owner, { type: "message.updated", conversationId, messageId, occurredAt: now });
        return { updated, event };
      })();
      hostChangeEventBus(app).publish(owner, event);
      return updated;
    },
  );

  app.put(
    `${PREFIX}/conversations/:conversationId/messages/:messageId/feedback/comment`,
    { preHandler: requireSession, schema: { body: SET_FEEDBACK_COMMENT_BODY_SCHEMA } },
    async (request) => {
      const owner = ownerKeyOf(request);
      const { conversationId, messageId } = request.params as { conversationId: string; messageId: string };
      const { db, message } = resolveAssistantMessage(app, owner, conversationId, messageId);

      if (message.feedback == null) {
        throw new ConversationDomainError(400, "請先提供「有幫助」或「沒有幫助」的回饋。");
      }

      const { comment } = request.body as { comment: string };
      // The contract's minLength:1 does not catch a whitespace-only
      // comment; "trimmed by the server, empty-after-trim is 400" (contract
      // description) is this check, not the JSON schema.
      const trimmed = comment.trim();
      if (trimmed.length === 0) throw new ConversationDomainError(400, "留言不得為空白。");

      const now = new Date().toISOString();
      const { updated, event } = db.transaction(() => {
        const updated = setFeedbackComment(db, owner, messageId, trimmed, now);
        const event = appendChangeEvent(db, owner, { type: "message.updated", conversationId, messageId, occurredAt: now });
        return { updated, event };
      })();
      hostChangeEventBus(app).publish(owner, event);
      return updated;
    },
  );

  app.put(
    `${PREFIX}/conversations/:conversationId/messages/:messageId/citations/:citationId/feedback`,
    { preHandler: requireSession, schema: { body: SET_FEEDBACK_BODY_SCHEMA } },
    async (request) => {
      const owner = ownerKeyOf(request);
      const { conversationId, messageId, citationId } = request.params as {
        conversationId: string;
        messageId: string;
        citationId: string;
      };
      const { db, message } = resolveAssistantMessage(app, owner, conversationId, messageId);

      if (!extractCitationIds(message.content).has(citationId)) {
        throw new ConversationDomainError(400, "這則訊息沒有這個引用來源。");
      }

      const { verdict } = request.body as { verdict: AnswerFeedbackVerdict };
      const now = new Date().toISOString();
      const { updated, event } = db.transaction(() => {
        const updated = setCitationFeedback(db, owner, messageId, citationId, verdict, now);
        const event = appendChangeEvent(db, owner, { type: "message.updated", conversationId, messageId, occurredAt: now });
        return { updated, event };
      })();
      hostChangeEventBus(app).publish(owner, event);
      return updated;
    },
  );
}
