import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { setApiFetchForTests } from "@/lib/api";
import { fakeFetch, resetFakeApi, seedSampleConversations } from "@/test/fake-api";

// E03-S046: `conversations.ts`'s `CONVERSATIONS_PAGE_SIZE` is now computed
// once at module load from this env var (default 20) instead of a
// hardcoded 2 — set it here, before any test file's own imports pull in
// `conversations.ts` (setupFiles fully evaluate before any test file's
// module graph loads), so every existing test that depends on 2-per-page
// pagination behaviour (`conversations.test.ts`'s own assertions,
// sidebar/history fixtures sized around it) keeps seeing exactly the same
// value as before this story, unmodified.
process.env.NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE = "2";

// E03-S045: the "mock_triggers" feature flag (feature-flags.ts) now
// gates every "[模擬:X]" demo/test hook — defaultEnabled: false in
// production. `isFeatureEnabled()` reads `process.env` fresh on every
// call (not once at module load, unlike CONVERSATIONS_PAGE_SIZE above),
// but this is still set at the same top level for consistency and so
// every existing trigger-dependent test (answer-state.test.ts,
// streaming.test.ts, file-processing.test.ts, knowledge-documents.test.ts)
// keeps seeing exactly the same "triggers work" behaviour as before this
// story, unmodified. Individual tests exercising the flag-OFF default
// (this story's own new tests) locally override via `vi.stubEnv(...,
// "false")` + `vi.unstubAllEnvs()` in their own `afterEach`, same pattern
// feature-flags.test.ts already establishes.
process.env.NEXT_PUBLIC_FEATURE_MOCK_TRIGGERS = "true";

// Explicit registration (rather than relying on RTL's global-afterEach
// auto-detection) since this project imports test globals per-file instead
// of enabling vitest's `test.globals`. Without this, renders from earlier
// tests in the same file stay mounted and later queries see duplicates.
afterEach(() => {
  cleanup();
});

// E03-S036: every test starts from the same known state — the fake API reset and
// re-seeded with the same 3 conversations `SAMPLE_CONVERSATIONS` used to seed
// (sidebar.test.tsx's href assertions depend on these exact ids/titles being present
// by default, with no explicit seed call of its own) — and the singleton apiClient
// pointed at it instead of a real backend.
beforeEach(() => {
  resetFakeApi();
  seedSampleConversations();
  setApiFetchForTests(fakeFetch);
});
