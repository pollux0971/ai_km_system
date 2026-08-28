import { createHttpAuthClient, createMockAuthClient } from "@ai-km/auth-client";
import type { AuthClient } from "@ai-km/auth-client";
import { apiClient } from "./api";

/**
 * E11-S026 (mirrors apps/web/src/lib/auth.ts from E03-S035): backed by the
 * real `/auth/*` endpoints via @ai-km/api-client by default. Set
 * NEXT_PUBLIC_AUTH_BACKEND=mock to fall back to the in-memory mock (e.g.
 * for unit tests) — consumers depend on the AuthClient type only, so this
 * switch never touches call sites.
 */
export const authClient: AuthClient =
  process.env.NEXT_PUBLIC_AUTH_BACKEND === "mock" ? createMockAuthClient() : createHttpAuthClient(apiClient);
