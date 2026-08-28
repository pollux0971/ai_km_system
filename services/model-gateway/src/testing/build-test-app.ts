/**
 * HTTP-level test harness for THIS package's route tests. Same reasoning
 * as `services/conversation/src/testing/build-test-app.ts`: a minimal
 * Fastify instance decorating exactly the surface `apps/api/README.md`
 * promises a domain plugin (`requireSession`), then mounting the real
 * route handler — so a route test exercises the actual handler and the
 * actual `TranscriptionProvider` passed in, not a stand-in for the route
 * itself. `provider` is a parameter (not resolved from env/config) so a
 * test can inject a fake, a scripted-failure fake, or a `fetch`-mocked
 * `WhisperServerProvider`.
 */
import Fastify, { type FastifyInstance, type FastifyError, type FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { registerTranscriptionRoutes } from "../routes/transcriptions.js";
import type { TranscriptionProvider } from "../asr/provider.js";
import type { TelemetryLogger } from "../routes/transcriptions.js";

export const TEST_USER_HEADER = "x-test-user";

const STATUS_TO_CODE: Record<number, string> = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHENTICATED",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
};

function safeMessageFor(code: string): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return "請先登入。";
    default:
      return "系統發生未預期的錯誤,請稍後再試。";
  }
}

export interface TestApp {
  readonly app: FastifyInstance;
  readonly telemetryLog: Array<{ fields: Record<string, unknown>; message: string }>;
}

export async function buildTestApp(
  provider: TranscriptionProvider,
  routeOptions: { timeoutMs?: number } = {},
): Promise<TestApp> {
  const app = Fastify({ logger: false });
  await app.register(multipart);

  app.decorate("requireSession", async function requireSession(request: FastifyRequest) {
    const header = request.headers[TEST_USER_HEADER];
    const userId = Array.isArray(header) ? header[0] : header;
    if (typeof userId !== "string" || userId.trim() === "") {
      throw Object.assign(new Error(safeMessageFor("UNAUTHENTICATED")), { statusCode: 401 });
    }
    Object.assign(request, { auth: { userId } });
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const status = typeof error.statusCode === "number" ? error.statusCode : 500;
    const mapped = STATUS_TO_CODE[status];
    if (mapped && status < 500) {
      reply.status(status).send({ code: mapped, message: error.message || safeMessageFor(mapped) });
      return;
    }
    reply.status(500).send({ code: "INTERNAL_ERROR", message: safeMessageFor("INTERNAL_ERROR") });
  });

  const telemetryLog: Array<{ fields: Record<string, unknown>; message: string }> = [];
  const telemetry: TelemetryLogger = {
    info(fields, message) {
      telemetryLog.push({ fields, message });
    },
  };

  await app.register(async (scope) => {
    registerTranscriptionRoutes(scope, { provider, telemetry, ...routeOptions });
  });
  await app.ready();

  return { app, telemetryLog };
}
