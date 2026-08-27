/**
 * Authentication seam (E04-S039, ADR 0005 §3).
 *
 * This story owns the INTERFACE, not a real implementation. The default
 * `requireSession` denies every request; E02-S032 replaces it with the real
 * session lookup. Denying by default is the point: a protected route written
 * before E02-S032 lands must return 401, never fall open.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiHttpError, ERROR_CODES } from "./errors.js";
import type { AuthContext } from "./types.js";

export const TEST_USER_HEADER = "x-test-user";

function deny(): never {
  throw new ApiHttpError(ERROR_CODES.UNAUTHENTICATED, 401, "請先登入。");
}

export interface RegisterAuthOptions {
  /**
   * Enables the `x-test-user` injection path. Callers must have already
   * refused to enable it in production — `buildServer` asserts that.
   */
  readonly enableTestProvider: boolean;
}

export function registerAuth(app: FastifyInstance, options: RegisterAuthOptions): void {
  if (!options.enableTestProvider) {
    app.decorate("requireSession", async function requireSession() {
      deny();
    });
    return;
  }

  app.decorate(
    "requireSession",
    async function requireSession(request: FastifyRequest) {
      const header = request.headers[TEST_USER_HEADER];
      const userId = Array.isArray(header) ? header[0] : header;
      if (typeof userId !== "string" || userId.trim() === "") deny();

      const auth: AuthContext = {
        userId,
        // No sandbox suffix here: the sandbox owner-key scheme belongs to
        // E02-S032 / ADR 0005 §5, and inventing half of it now would give
        // later stories a shape to fight rather than build on.
        ownerKey: userId,
        roles: [],
        sessionId: `test-session:${userId}`,
      };
      request.auth = auth;
    },
  );
}
