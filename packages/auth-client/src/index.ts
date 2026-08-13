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
}

export interface AuthClient {
  login(credentials: { username: string; password: string }): Promise<Result<AuthSession, ApiError>>;
  logout(): Promise<Result<void, ApiError>>;
  getSession(): Promise<Result<AuthSession | null, ApiError>>;
}
