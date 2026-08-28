import { createApiClient } from "@ai-km/api-client";
import type { ApiClient } from "@ai-km/api-client";

function buildClient(fetchImpl?: (input: Request) => Promise<Response>): ApiClient {
  return createApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1", fetch: fetchImpl });
}

/**
 * Singleton typed API client (E03-S034). `NEXT_PUBLIC_API_BASE_URL` defaults to the
 * same-origin `/api/v1` rewrite (apps/web/next.config.ts -> API_INTERNAL_URL), so this
 * works with zero env config in dev. Reassignable (not `const`) so
 * `setApiFetchForTests` below can swap in the fake API's fetch — every adapter reads
 * this binding fresh on each call (a live ES module binding), so the swap takes effect
 * immediately for every existing import of `apiClient`.
 */
export let apiClient: ApiClient = buildClient();

/**
 * E03-S036 test-only hook: rebuilds the singleton client with a fake `fetch` (e.g. the
 * in-memory contract-validated fake API in `apps/web/src/test/fake-api.ts`), so unit
 * tests never need a real backend or `NEXT_PUBLIC_API_BASE_URL`. Never called from
 * production code.
 *
 * Uses an absolute `baseUrl` (unlike the real singleton's relative `/api/v1`) because
 * Node's `fetch`/`Request` — unlike a browser's — does not resolve a relative URL
 * against a "current page" when there isn't one; the vitest/jsdom test environment hits
 * this directly (`new Request("/api/v1/...")` throws `Invalid URL`), so tests need an
 * origin even though production, running in an actual browser tab, does not.
 */
export function setApiFetchForTests(fetchImpl: (input: Request) => Promise<Response>): void {
  apiClient = createApiClient({ baseUrl: "http://localhost/api/v1", fetch: fetchImpl });
}
