import type { ApiError, Result } from "@ai-km/types";
import type { AuthClient, AuthErrorCode, AuthSession } from "./index";

/**
 * Contract-compatible test double for AuthClient (E01-S002), used until the
 * E02 (Identity, RBAC & Authorization) contract exists — see
 * docs/stories/E01-S002.md for the proposed (non-binding) request/response
 * shape this mirrors. Per DEVELOPMENT_POLICY.md #8, this mock unblocks
 * frontend work but is never itself production integration evidence.
 *
 * Documented trigger values (stable — other stories/tests may rely on
 * these until the real client replaces this mock):
 * - username "demo-user", password "demo-pass-123" -> success
 * - username "disabled"                             -> ACCOUNT_DISABLED
 * - username "service-error"                        -> SERVICE_UNAVAILABLE
 * - anything else                                    -> INVALID_CREDENTIALS
 */
export const MOCK_VALID_USERNAME = "demo-user";
export const MOCK_VALID_PASSWORD = "demo-pass-123";
export const MOCK_VALID_USER_ID = "mock-user-1";

function authError(code: AuthErrorCode, message: string): ApiError {
  return { code, message };
}

export function createMockAuthClient(): AuthClient {
  let currentSession: AuthSession | null = null;

  return {
    async login({ username, password }): Promise<Result<AuthSession, ApiError>> {
      if (username === "disabled") {
        return { ok: false, error: authError("ACCOUNT_DISABLED", "此帳號已停用，請聯絡管理員。") };
      }
      if (username === "service-error") {
        return {
          ok: false,
          error: authError("SERVICE_UNAVAILABLE", "登入服務暫時無法使用，請稍後再試。"),
        };
      }
      if (username === MOCK_VALID_USERNAME && password === MOCK_VALID_PASSWORD) {
        currentSession = {
          userId: MOCK_VALID_USER_ID,
          roles: ["general_user"],
          expiresAt: new Date(Date.UTC(2099, 0, 1)).toISOString(),
        };
        return { ok: true, value: currentSession };
      }
      return { ok: false, error: authError("INVALID_CREDENTIALS", "帳號或密碼錯誤。") };
    },

    async logout(): Promise<Result<void, ApiError>> {
      currentSession = null;
      return { ok: true, value: undefined };
    },

    async getSession(): Promise<Result<AuthSession | null, ApiError>> {
      return { ok: true, value: currentSession };
    },
  };
}
