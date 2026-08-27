/**
 * Correlation id propagation (E04-S039, ADR 0003 §5).
 *
 * apps/web's middleware already stamps `x-correlation-id` on outgoing
 * requests. The API keeps the same id rather than minting its own, so one
 * user action can be followed across web → api → (later) worker in the logs.
 *
 * The id is installed as Fastify's own request id (see `genReqId` in
 * server.ts), which is what puts it on the framework's automatic request log
 * lines as well as on anything a handler logs.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { IncomingHttpHeaders } from "node:http";

export const CORRELATION_HEADER = "x-correlation-id";

/**
 * Deliberately narrow: an id ends up in every log line for this request, so a
 * value carrying newlines, control characters or unbounded length is a log
 * injection vector. A malformed inbound id is replaced rather than echoed.
 */
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function readCorrelationId(headers: IncomingHttpHeaders): string {
  const incoming = headers[CORRELATION_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  return typeof candidate === "string" && SAFE_CORRELATION_ID.test(candidate)
    ? candidate
    : randomUUID();
}

export function registerCorrelation(app: FastifyInstance): void {
  app.decorateRequest("correlationId", "");

  app.addHook("onRequest", (request, reply, done) => {
    request.correlationId = request.id;
    void reply.header(CORRELATION_HEADER, request.id);
    done();
  });
}
