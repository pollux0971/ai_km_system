import type { ApiError, Result } from "@ai-km/types";

/**
 * Structural shape every openapi-fetch client method resolves to (success or error
 * branch, unified). Declared locally instead of importing openapi-fetch's `FetchResponse`
 * because that type is parameterized by the *operation* object, not the response data —
 * this narrower shape is what `toResult` actually needs and is structurally compatible
 * with what every `client.<SPEC>.<METHOD>(...)` call resolves to.
 */
interface OpenApiFetchResponse<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function isErrorEnvelope(value: unknown): value is { code: string; message: string; details?: Record<string, unknown> } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

/**
 * Normalizes an in-flight openapi-fetch call into the shared `Result<T, ApiError>` shape.
 * Takes the *pending* call (not yet awaited) so it can also catch network failures and
 * non-JSON bodies, which openapi-fetch surfaces as a rejected promise rather than as its
 * usual `{data,error,response}` shape.
 */
export async function toResult<T>(pending: Promise<OpenApiFetchResponse<T>> | OpenApiFetchResponse<T>): Promise<Result<T, ApiError>> {
  let resolved: OpenApiFetchResponse<T>;
  try {
    resolved = await pending;
  } catch {
    return { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Network error or invalid response body" } };
  }

  const { data, error, response } = resolved;

  if (response.status === 401) {
    return {
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: isErrorEnvelope(error) ? error.message : "Unauthenticated",
        details: isErrorEnvelope(error) ? error.details : undefined,
      },
    };
  }

  if (response.ok) {
    return { ok: true, value: data as T };
  }

  if (isErrorEnvelope(error)) {
    return { ok: false, error: { code: error.code, message: error.message, details: error.details } };
  }

  return { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: `Unexpected response (status ${response.status})` } };
}
