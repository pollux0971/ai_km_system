import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { setApiFetchForTests } from "@/lib/api";
import { fakeFetch, resetFakeApi } from "@/test/fake-api";

// Explicit registration (rather than relying on RTL's global-afterEach
// auto-detection) since this project imports test globals per-file instead
// of enabling vitest's `test.globals`. Without this, renders from earlier
// tests in the same file stay mounted and later queries see duplicates.
afterEach(() => {
  cleanup();
});

/**
 * E13-S021: the 4 admin lib files now call the real `apiClient` — every
 * test starts from a clean fake (no usage days, no latency samples, no
 * feedback, health all `ok`), same "no plausible-looking fabricated
 * default" discipline `resetFakeApi()` itself documents. Inert for every
 * OTHER existing admin test: they `vi.mock` the lib layer directly and
 * never call `apiClient`/`fetch` at all, so wiring a fake fetch underneath
 * them changes nothing they exercise.
 */
beforeEach(() => {
  resetFakeApi();
  setApiFetchForTests(fakeFetch);
});
