import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { setApiFetchForTests } from "@/lib/api";
import { fakeFetch, resetFakeApi, seedSampleConversations } from "@/test/fake-api";

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
