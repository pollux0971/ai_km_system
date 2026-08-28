import type { ApiClient } from "@ai-km/api-client";
import type { ApiError, Result } from "@ai-km/types";
import type { AuthClient, AuthSession } from "./index";

function isErrorEnvelope(value: unknown): value is { code: string; message: string; details?: Record<string, unknown> } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

interface RawAuthResponse<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/**
 * Normalizes a pending `api.auth.*` call into `Result<T, ApiError>`, preserving the
 * server's `code` as-is on every non-2xx status (including 401) — unlike
 * `@ai-km/api-client`'s `toResult`, which forces every 401 to `UNAUTHENTICATED`. Login's
 * 401 is `INVALID_CREDENTIALS`, a domain error the caller must see verbatim (AC2); only
 * `getSession` (below) treats a 401 as the expected "not signed in" state.
 */
async function toAuthResult<T>(pending: Promise<RawAuthResponse<T>>): Promise<Result<T, ApiError>> {
  let resolved: RawAuthResponse<T>;
  try {
    resolved = await pending;
  } catch {
    return { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Network error or invalid response body" } };
  }

  const { data, error, response } = resolved;

  if (response.ok) {
    return { ok: true, value: data as T };
  }
  if (isErrorEnvelope(error)) {
    return { ok: false, error: { code: error.code, message: error.message, details: error.details } };
  }
  return { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: `Unexpected response (status ${response.status})` } };
}

/**
 * `AuthClient` backed by the real `/auth/*` endpoints (contracts/openapi/auth.yaml,
 * frozen under E02-S031) via the E03-S034 typed client. The session token itself is an
 * HttpOnly cookie the browser manages — this client never reads or stores it.
 */
export function createHttpAuthClient(api: ApiClient): AuthClient {
  return {
    async login({ username, password }): Promise<Result<AuthSession, ApiError>> {
      return toAuthResult<AuthSession>(api.auth.POST("/auth/login", { body: { username, password } }));
    },

    async logout(): Promise<Result<void, ApiError>> {
      const result = await toAuthResult<undefined>(api.auth.POST("/auth/logout", {}));
      return result.ok ? { ok: true, value: undefined } : result;
    },

    async getSession(): Promise<Result<AuthSession | null, ApiError>> {
      const result = await toAuthResult<AuthSession>(api.auth.GET("/auth/session", {}));
      if (!result.ok && result.error.code === "UNAUTHENTICATED") {
        return { ok: true, value: null };
      }
      return result;
    },
  };
}
