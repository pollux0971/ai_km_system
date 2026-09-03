import type { Result, ApiError } from "@ai-km/types";

/**
 * Interface stub for the E02 (Identity, RBAC & Authorization) client that
 * Team B owns. Real implementation is wired once the E02 contract in
 * contracts/openapi is frozen — until then this is a typed placeholder so
 * apps/web and apps/admin can compile against a stable shape and swap in a
 * mock (see contracts/mocks once added).
 */

export interface AuthSession {
  userId: string;
  roles: string[];
  expiresAt: string;
  /**
   * Profile display fields (E01-S010). Optional — additive per the
   * API/Contract Boundary ("新增 optional field 不得改變既有 consumer
   * 的預設語意"), so every session-shaped value already in use
   * (fixtures, other stories' tests) stays valid without modification.
   * A real E02-backed session may not populate all of these.
   */
  name?: string;
  email?: string;
  department?: string;
  group?: string;
}

/**
 * Named and exported (E04-S076) so `contracts/openapi/__checks__/auth-compat.ts`
 * has something real to bind `LoginRequest` to — an inline anonymous parameter
 * type has no name a compat file can import. Type-level change only; the
 * shape is unchanged, so every existing call site (which already passes an
 * object literal, never a value of this type by variable) keeps compiling.
 */
export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthClient {
  login(credentials: LoginCredentials): Promise<Result<AuthSession, ApiError>>;
  logout(): Promise<Result<void, ApiError>>;
  getSession(): Promise<Result<AuthSession | null, ApiError>>;
}

/**
 * Stable machine-readable error codes for AuthClient failures (see
 * ATOMIC_STORY_BOUNDARIES.md API/Contract Boundary — consumers must be
 * able to branch on `code`, never on exception/message text).
 */
export type AuthErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_DISABLED"
  | "SERVICE_UNAVAILABLE";

export * from "./mock";
export { createHttpAuthClient } from "./http";
