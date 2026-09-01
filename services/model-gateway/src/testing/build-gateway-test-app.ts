/**
 * HTTP harness for the embedding/generation routes.
 *
 * Same shape and reasoning as `build-test-app.ts`: a minimal Fastify instance
 * decorating exactly what `apps/api/README.md` promises a domain plugin
 * (`requireSession`), then mounting the REAL route handlers over a REAL
 * `ModelGateway`. The gateway is a parameter so a test can inject a provider
 * that fails on purpose.
 */
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from "fastify";
import { registerEmbeddingRoutes, registerGenerationRoutes } from "../routes/model-gateway-routes.js";
import type { ModelGateway } from "../gateway.js";
import type { TelemetryLogger } from "../routes/model-gateway-routes.js";

export const TEST_USER_HEADER = "x-test-user";

export interface GatewayTestApp {
  readonly app: FastifyInstance;
  readonly telemetryLog: Array<{ fields: Record<string, unknown>; message: string }>;
}

export async function buildGatewayTestApp(gateway: ModelGateway): Promise<GatewayTestApp> {
  const app = Fastify({ logger: false });

  app.decorate("requireSession", async function requireSession(request: FastifyRequest) {
    const header = request.headers[TEST_USER_HEADER];
    const userId = Array.isArray(header) ? header[0] : header;
    if (typeof userId !== "string" || userId.trim() === "") {
      throw Object.assign(new Error("請先登入。"), { statusCode: 401 });
    }
    Object.assign(request, { auth: { userId } });
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const status = typeof error.statusCode === "number" ? error.statusCode : 500;
    if (status === 401) {
      reply.status(401).send({ code: "UNAUTHENTICATED", message: error.message });
      return;
    }
    reply.status(500).send({ code: "INTERNAL_ERROR", message: "系統發生未預期的錯誤,請稍後再試。" });
  });

  const telemetryLog: Array<{ fields: Record<string, unknown>; message: string }> = [];
  const telemetry: TelemetryLogger = {
    info(fields, message) {
      telemetryLog.push({ fields, message });
    },
  };

  await app.register(async (scope) => {
    registerEmbeddingRoutes(scope, { gateway, telemetry });
    registerGenerationRoutes(scope, { gateway, telemetry });
  });
  await app.ready();

  return { app, telemetryLog };
}
