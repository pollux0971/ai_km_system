/**
 * `POST /v1/embeddings` and `POST /v1/generate` — thin wrappers.
 *
 * Neither handler contains behaviour. Each parses the body, calls the SAME
 * `ModelGateway` function an in-process caller would call, and maps the thrown
 * error to the status code and stable `code` the contract declares. If a rule
 * ever appears here that is not in `gateway.ts`, the in-process path has
 * silently lost it — that is the drift this shape exists to prevent.
 *
 * Errors are replied directly rather than thrown, for the same reason
 * `routes/transcriptions.ts` does it: `apps/api/src/errors.ts` maps 503 to the
 * platform-generic `SERVICE_UNAVAILABLE`, not to this contract's
 * `EMBEDDING_UNAVAILABLE` / `GENERATION_UNAVAILABLE`. Only genuinely
 * unexpected errors are allowed to reach the host's 500 handler, where
 * `INTERNAL_ERROR` is what both contracts already say.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hostRequireSession, requestAuth } from "../plugin-types.js";
import {
  GenerationNoContextError,
  ModelGatewayPayloadTooLargeError,
  ModelGatewayValidationError,
  type ModelGateway,
} from "../gateway.js";
import { EmbeddingUnavailableError } from "../embedding/provider.js";
import {
  FabricatedCitationError,
  GenerationUnavailableError,
} from "../generation/provider.js";

const PREFIX = "/v1";

export interface TelemetryLogger {
  info(fields: Record<string, unknown>, message: string): void;
}

export interface RegisterModelGatewayRoutesOptions {
  readonly gateway: ModelGateway;
  readonly telemetry?: TelemetryLogger;
}

function correlationIdOf(request: FastifyRequest): string {
  return (request.headers["x-correlation-id"] as string | undefined) ?? request.id;
}

/** Present only after `requireSession` allowed the request. Fail closed. */
function ensureAuthenticated(request: FastifyRequest, reply: FastifyReply): boolean {
  if (requestAuth(request)) return true;
  void reply.status(401).send({ code: "UNAUTHENTICATED", message: "請先登入。" });
  return false;
}

export function registerEmbeddingRoutes(
  app: FastifyInstance,
  options: RegisterModelGatewayRoutesOptions,
): void {
  const requireSession = hostRequireSession(app);

  app.post(
    `${PREFIX}/embeddings`,
    { preHandler: requireSession },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!ensureAuthenticated(request, reply)) return;
      const body = (request.body ?? {}) as { input?: unknown; model?: unknown };
      const startedAt = Date.now();

      try {
        const result = await options.gateway.embed(
          {
            input: body.input as readonly string[],
            ...(typeof body.model === "string" ? { model: body.model } : {}),
          },
          correlationIdOf(request),
        );
        // Metadata only — never the input text, never the vectors.
        options.telemetry?.info(
          {
            count: result.data.length,
            dimensions: result.dimensions,
            model: result.model,
            processingMs: Date.now() - startedAt,
            correlationId: correlationIdOf(request),
          },
          "embeddings completed",
        );
        return result;
      } catch (error) {
        if (error instanceof ModelGatewayPayloadTooLargeError) {
          void reply.status(413).send({ code: "PAYLOAD_TOO_LARGE", message: error.message });
          return;
        }
        if (error instanceof ModelGatewayValidationError) {
          void reply.status(400).send({ code: "VALIDATION_ERROR", message: error.message });
          return;
        }
        if (error instanceof EmbeddingUnavailableError) {
          void reply.status(503).send({ code: "EMBEDDING_UNAVAILABLE", message: error.message });
          return;
        }
        throw error;
      }
    },
  );
}

export function registerGenerationRoutes(
  app: FastifyInstance,
  options: RegisterModelGatewayRoutesOptions,
): void {
  const requireSession = hostRequireSession(app);

  app.post(
    `${PREFIX}/generate`,
    { preHandler: requireSession },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!ensureAuthenticated(request, reply)) return;
      const body = (request.body ?? {}) as {
        question?: unknown;
        context?: unknown;
        model?: unknown;
      };
      const startedAt = Date.now();

      try {
        const result = await options.gateway.generate(
          {
            question: body.question as string,
            context: (body.context ?? []) as never,
            ...(typeof body.model === "string" ? { model: body.model } : {}),
          },
          correlationIdOf(request),
        );
        options.telemetry?.info(
          {
            citationCount: result.citations.length,
            answerLength: result.answer.length,
            model: result.model,
            processingMs: Date.now() - startedAt,
            correlationId: correlationIdOf(request),
          },
          "generation completed",
        );
        return result;
      } catch (error) {
        if (error instanceof GenerationNoContextError) {
          void reply.status(422).send({ code: "GENERATION_NO_CONTEXT", message: error.message });
          return;
        }
        if (error instanceof ModelGatewayValidationError) {
          void reply.status(400).send({ code: "VALIDATION_ERROR", message: error.message });
          return;
        }
        if (
          error instanceof GenerationUnavailableError ||
          // A fabricated citation means the provider misbehaved. It is a
          // provider failure, not a client error, and the whole response is
          // refused rather than partially served.
          error instanceof FabricatedCitationError
        ) {
          void reply
            .status(503)
            .send({ code: "GENERATION_UNAVAILABLE", message: "生成模型目前無法使用。" });
          return;
        }
        throw error;
      }
    },
  );
}
