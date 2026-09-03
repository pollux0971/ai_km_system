/**
 * Change-event SSE stream (E04-S044). Wire format and replay/resync
 * semantics are normative in `contracts/events/conversation-change-events.md`
 * — this file implements that document, not a fresh design.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  getLatestSeq,
  listChangeEventsAfter,
  type ChangeEventRow,
} from "../repository/change-events.repository.js";
import { toOwnerKey, type OwnerKey } from "../repository/owner-scope.js";
import { hostChangeEventBus, hostDb, hostRequireSession, requestAuth } from "../plugin-types.js";
import { ConversationDomainError } from "../domain-error.js";

const PREFIX = "/v1";

/** Contract: "Twenty concurrent streams per owner" replay cap. */
const REPLAY_LIMIT = 500;

/** Production default (contract §2). Tests override via plugin options — see `ChangeEventRouteOptions`. */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

export interface ChangeEventRouteOptions {
  /** Overridden by tests only; production always uses `DEFAULT_HEARTBEAT_INTERVAL_MS`. */
  readonly heartbeatIntervalMs?: number;
}

function ownerKeyOf(request: FastifyRequest): OwnerKey {
  const auth = requestAuth(request);
  if (!auth) throw new ConversationDomainError(401, "請先登入。");
  return toOwnerKey(auth.ownerKey);
}

/**
 * `ChangeEvent.id` on the wire is the row's `seq` — see contract schema.
 *
 * No explicit return-type annotation (E04-S072, option (d), user-approved
 * 2026-09-03): an annotation of `Record<string, unknown>` type-checks but
 * erases every field — `ReturnType<typeof toWirePayload>` then resolves to
 * that erased declared type, not the object literal's actual shape, so a
 * type-only export built on it carried zero field information. Letting the
 * return type be INFERRED from the literal below means `ChangeEventWire`
 * (in `../../../contracts/openapi/__checks__/conversations-compat.ts`) binds
 * to the real shape. This function has exactly one call site (below), which
 * immediately `JSON.stringify`s the result, so narrowing its inferred type
 * cannot break a caller.
 */
function toWirePayload(event: ChangeEventRow) {
  return {
    id: event.seq,
    type: event.type,
    conversationId: event.conversationId,
    ...(event.messageId ? { messageId: event.messageId } : {}),
    occurredAt: event.occurredAt,
    ...(event.originClientId ? { originClientId: event.originClientId } : {}),
  };
}

/**
 * Type-only export of the SSE wire shape (E04-S072, option (d)). Zero
 * runtime change — `ReturnType<>` is erased at compile time. Consumed by
 * `contracts/openapi/__checks__/conversations-compat.ts` to bind
 * `ChangeEvent` against what this route actually serialises, instead of the
 * `ChangeEventRow` repository type (which differs in the one field that
 * matters: `seq` on the row vs. `id` on the wire).
 */
export type ChangeEventWire = ReturnType<typeof toWirePayload>;

function parseLastEventId(request: FastifyRequest): number | "malformed" | undefined {
  const headerRaw = request.headers["last-event-id"];
  const headerVal = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  const queryVal = (request.query as { lastEventId?: string } | undefined)?.lastEventId;
  const supplied = headerVal ?? queryVal;
  if (supplied === undefined) return undefined;

  const parsed = Number(supplied);
  if (!Number.isInteger(parsed) || parsed < 0) return "malformed";
  return parsed;
}

export function registerChangeEventRoutes(app: FastifyInstance, options: ChangeEventRouteOptions = {}): void {
  const requireSession = hostRequireSession(app);
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;

  app.get(`${PREFIX}/conversations/events`, { preHandler: requireSession }, async (request, reply) => {
    const owner = ownerKeyOf(request);
    const db = hostDb(app);
    const bus = hostChangeEventBus(app);

    const onLiveEvent = (event: ChangeEventRow): void => {
      reply.raw.write(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(toWirePayload(event))}\n\n`);
    };

    // Subscribe BEFORE committing to the stream: the connection cap must be
    // checked before any bytes (let alone a 200 status) go out, so a
    // rejected caller gets a normal, non-hijacked 429 response instead of a
    // stream that opens and then immediately closes.
    const unsubscribe = bus.subscribe(owner, onLiveEvent);
    if (!unsubscribe) {
      void reply.status(429);
      return { code: "TOO_MANY_CONNECTIONS", message: "同時連線數已達上限。" };
    }

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    });
    res.write(": connected\n\nretry: 3000\n\n");

    const lastEventId = parseLastEventId(request);
    if (lastEventId === "malformed") {
      res.write(`event: resync\ndata: ${JSON.stringify({ reason: "UNKNOWN_LAST_EVENT_ID" })}\n\n`);
    } else if (lastEventId !== undefined && lastEventId > 0) {
      const latestSeq = getLatestSeq(db, owner);
      if (lastEventId > latestSeq) {
        res.write(`event: resync\ndata: ${JSON.stringify({ reason: "UNKNOWN_LAST_EVENT_ID" })}\n\n`);
      } else {
        const pending = listChangeEventsAfter(db, owner, lastEventId, REPLAY_LIMIT + 1);
        if (pending.length > REPLAY_LIMIT) {
          res.write(`event: resync\ndata: ${JSON.stringify({ reason: "EVENT_LOG_TRUNCATED" })}\n\n`);
        } else {
          for (const event of pending) onLiveEvent(event);
        }
      }
    }

    const heartbeat = setInterval(() => res.write(":\n\n"), heartbeatIntervalMs);
    heartbeat.unref();

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    res.on("close", cleanup);
  });
}
