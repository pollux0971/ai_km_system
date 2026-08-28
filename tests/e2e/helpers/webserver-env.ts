/**
 * Single source of truth for the env values `web`/`admin`'s webServer
 * entries need (E04-S056 AC5.1) — used both to actually SET them
 * (`playwright.config.ts`) and to VERIFY a reused server still has them
 * (`global-setup.ts`, via `helpers/env-sentinel.ts`). Two separate literals
 * that happen to agree today is exactly the kind of seam this story exists
 * to close.
 */

// Deliberately NOT port 4000 — see playwright.config.ts's own top-of-file
// doc comment (E03-S038).
export const API_PORT = 4100;
export const API_BASE_URL = `http://127.0.0.1:${API_PORT}`;

export const WEB_EXPECTED_ENV = {
  API_INTERNAL_URL: API_BASE_URL,
  // E03-S046 / E03-S045 — see playwright.config.ts's own env block comments
  // for why each of these two must be exactly these values in E2E.
  NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE: "2",
  NEXT_PUBLIC_FEATURE_MOCK_TRIGGERS: "true",
} as const;

export const ADMIN_EXPECTED_ENV = {
  API_INTERNAL_URL: API_BASE_URL,
} as const;
