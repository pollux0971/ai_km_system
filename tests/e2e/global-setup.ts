/**
 * E01-S027 root-cause finding (ROADMAP_TEMP.md §5-nona, 2026-08-28-29):
 * Next.js dev servers compile routes on demand — Playwright's `webServer.url`
 * readiness check only confirms the PORT is listening, not that any
 * individual route has ever been compiled. Under concurrent multi-lane
 * load, the FIRST real request to a route (e.g. `/login`) can take long
 * enough to compile that it blows past a spec's own 30s navigation
 * timeout — producing a burst of failures concentrated at the start of a
 * full run that have nothing to do with the code under test.
 *
 * Runs AFTER Playwright's own webServer readiness check (globalSetup is
 * documented to run once webServer's `url` has already responded), so
 * `/login` on both apps is guaranteed reachable here — this just forces
 * the (potentially slow) FIRST compile to happen now, on a generous
 * budget, rather than mid-test on a spec's normal timeout.
 */
export default async function globalSetup(): Promise<void> {
  // E11-S026: apps/admin now has its own /login route too (previously it
  // had none — admin-smoke.spec.ts's own comment described that earlier
  // reality, which this story's whole point is to change), so it gets
  // the same warm-up target as apps/web.
  const targets = ["http://localhost:3000/login", "http://localhost:3001/login"];
  const deadline = Date.now() + 90000;

  await Promise.all(
    targets.map(async (url) => {
      let lastStatus: number | string = "never attempted";
      while (Date.now() < deadline) {
        try {
          const response = await fetch(url);
          lastStatus = response.status;
          if (response.status === 200) return;
        } catch (error) {
          lastStatus = String(error);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error(`globalSetup warm-up: ${url} never returned 200 within 90s (last: ${lastStatus})`);
    }),
  );
}
