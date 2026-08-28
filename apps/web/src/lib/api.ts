import { createApiClient } from "@ai-km/api-client";

/**
 * Singleton typed API client (E03-S034). `NEXT_PUBLIC_API_BASE_URL` defaults to the
 * same-origin `/api/v1` rewrite (apps/web/next.config.ts -> API_INTERNAL_URL), so this
 * works with zero env config in dev.
 */
export const apiClient = createApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1" });
