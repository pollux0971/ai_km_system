/**
 * E03-S038. `playwright.config.ts`'s own `webServer[].url` polling already
 * waits for `apps/api`'s `/v1/health` before starting any test — this
 * helper is for a SPEC that wants to wait again mid-run (e.g. after
 * deliberately restarting or otherwise disturbing the backend), not a
 * duplicate of the webServer readiness check.
 */
export async function waitForApiHealthy(
  baseUrl: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const intervalMs = options.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/v1/health`);
      if (response.ok) return;
      lastError = new Error(`GET /v1/health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`waitForApiHealthy: apps/api at ${baseUrl} did not become healthy within ${timeoutMs}ms: ${String(lastError)}`);
}
