import { createApiClient } from "@ai-km/api-client";
import type { ApiClient } from "@ai-km/api-client";

function buildClient(fetchImpl?: (input: Request) => Promise<Response>): ApiClient {
  return createApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1", fetch: fetchImpl });
}

/**
 * Singleton typed API client (E11-S026, mirrors apps/web/src/lib/api.ts from
 * E03-S034/E03-S035). `NEXT_PUBLIC_API_BASE_URL` defaults to the same-origin
 * `/api/v1` rewrite (apps/admin/next.config.ts -> API_INTERNAL_URL), so this
 * works with zero env config in dev. Reassignable (not `const`) so
 * `setApiFetchForTests` below can swap in a fake fetch for unit tests.
 */
export let apiClient: ApiClient = buildClient();

/** Test-only hook: rebuilds the singleton client with a fake `fetch`. Never called from production code. */
export function setApiFetchForTests(fetchImpl: (input: Request) => Promise<Response>): void {
  apiClient = createApiClient({ baseUrl: "http://localhost/api/v1", fetch: fetchImpl });
}
