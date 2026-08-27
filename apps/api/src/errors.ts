/**
 * Error envelope for apps/api (E04-S039, ADR 0003 §4).
 *
 * Every failure leaves this server as `core.yaml`'s `Error` shape —
 * `{code, message, details?}` — with a stable machine-readable `code`.
 * Consumers must never have to parse a message string to tell one failure
 * from another.
 */
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/** The stable, cross-domain code set from ADR 0003 §4. */
export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  GATEWAY_TIMEOUT: "GATEWAY_TIMEOUT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * The only error type a domain plugin should throw deliberately. Anything else
 * reaching the error handler is treated as a bug and becomes INTERNAL_ERROR.
 */
export class ApiHttpError extends Error {
  override readonly name = "ApiHttpError";
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, statusCode: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/** Serialises to the wire envelope and nothing else — never the stack. */
export function toErrorBody(error: ApiHttpError): ErrorBody {
  const body: ErrorBody = { code: error.code, message: error.message };
  if (error.details !== undefined) body.details = error.details;
  return body;
}

export interface ValidationIssue {
  /** Dotted/bracketed path to the offending field, e.g. `body.size`. */
  path: string;
  /** Why it was rejected — the rule, never the submitted value. */
  message: string;
}

/**
 * Turns Fastify's Ajv output into `details.issues`.
 *
 * The submitted value is deliberately dropped. A 400 body is the single most
 * likely error response to be logged, screenshotted or pasted into a ticket,
 * and echoing input back is how a mistyped password or a pasted secret ends up
 * somewhere it was never meant to be.
 */
export function toValidationIssues(error: FastifyError): ValidationIssue[] {
  const validation = error.validation ?? [];
  const context = error.validationContext ?? "body";
  return validation.map((issue) => {
    const instancePath = (issue.instancePath ?? "").replace(/^\//, "").replace(/\//g, ".");
    const missing =
      issue.keyword === "required"
        ? String((issue.params as { missingProperty?: string }).missingProperty ?? "")
        : "";
    const additional =
      issue.keyword === "additionalProperties"
        ? String((issue.params as { additionalProperty?: string }).additionalProperty ?? "")
        : "";
    const leaf = missing || additional;
    const path = [context, instancePath, leaf].filter((part) => part.length > 0).join(".");
    return { path, message: issue.message ?? "不符合契約定義。" };
  });
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: ERROR_CODES.VALIDATION_ERROR,
  401: ERROR_CODES.UNAUTHENTICATED,
  403: ERROR_CODES.PERMISSION_DENIED,
  404: ERROR_CODES.NOT_FOUND,
  409: ERROR_CODES.CONFLICT,
  413: ERROR_CODES.PAYLOAD_TOO_LARGE,
  415: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
  503: ERROR_CODES.SERVICE_UNAVAILABLE,
  504: ERROR_CODES.GATEWAY_TIMEOUT,
};

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    // The path is not echoed back: on a public surface that is a cheap
    // reflection primitive, and the caller already knows what it asked for.
    void request;
    reply.status(404).send(toErrorBody(new ApiHttpError(ERROR_CODES.NOT_FOUND, 404, "找不到這個路徑。")));
  });

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ApiHttpError) {
      request.log.info(
        { errCode: error.code, statusCode: error.statusCode },
        "request rejected with a declared error",
      );
      reply.status(error.statusCode).send(toErrorBody(error));
      return;
    }

    if (error.validation) {
      const issues = toValidationIssues(error);
      request.log.info({ errCode: ERROR_CODES.VALIDATION_ERROR, issues }, "request failed validation");
      reply
        .status(400)
        .send(
          toErrorBody(
            new ApiHttpError(ERROR_CODES.VALIDATION_ERROR, 400, "請求內容不符合契約定義。", { issues }),
          ),
        );
      return;
    }

    const status = typeof error.statusCode === "number" ? error.statusCode : 500;
    const mapped = STATUS_TO_CODE[status];
    if (mapped && status < 500) {
      // A framework-generated 4xx (bad JSON, unsupported media type, payload
      // too large). Its own message is safe to keep only in the log.
      request.log.info({ err: error, errCode: mapped, statusCode: status }, "request rejected");
      reply.status(status).send(toErrorBody(new ApiHttpError(mapped, status, safeMessageFor(mapped))));
      return;
    }

    // Unknown failure: the stack is kept server-side and the client is told
    // nothing beyond "something broke" (AC4).
    request.log.error({ err: error }, "unhandled error");
    reply
      .status(500)
      .send(
        toErrorBody(
          new ApiHttpError(ERROR_CODES.INTERNAL_ERROR, 500, "系統發生未預期的錯誤,請稍後再試。"),
        ),
      );
  });
}

function safeMessageFor(code: ErrorCode): string {
  switch (code) {
    case ERROR_CODES.VALIDATION_ERROR:
      return "請求內容不符合契約定義。";
    case ERROR_CODES.UNAUTHENTICATED:
      return "請先登入。";
    case ERROR_CODES.PERMISSION_DENIED:
      return "沒有執行這個操作的權限。";
    case ERROR_CODES.NOT_FOUND:
      return "找不到這筆資料。";
    case ERROR_CODES.CONFLICT:
      return "資料狀態衝突,請重新載入後再試。";
    case ERROR_CODES.PAYLOAD_TOO_LARGE:
      return "內容超過大小上限。";
    case ERROR_CODES.UNSUPPORTED_MEDIA_TYPE:
      return "不支援的內容格式。";
    case ERROR_CODES.SERVICE_UNAVAILABLE:
      return "服務暫時無法使用,請稍後再試。";
    case ERROR_CODES.GATEWAY_TIMEOUT:
      return "後端服務逾時,請稍後再試。";
    default:
      return "系統發生未預期的錯誤,請稍後再試。";
  }
}
