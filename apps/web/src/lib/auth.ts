import { createMockAuthClient } from "@ai-km/auth-client";
import type { AuthClient } from "@ai-km/auth-client";

/**
 * Mock-backed until the E02 (Identity, RBAC & Authorization) contract
 * exists (see docs/stories/E01-S002.md). Consumers depend on the
 * AuthClient type only, so swapping this for a real generated client is a
 * future story's job and shouldn't require touching call sites.
 */
export const authClient: AuthClient = createMockAuthClient();
