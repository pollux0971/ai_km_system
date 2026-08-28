import { test as setup } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { STORAGE_STATE_PATH } from "./auth-storage-state";

/**
 * E11-S026 — Playwright `setup` project. Logs into apps/admin (:3001) as
 * `demo-super` once, before the `admin` project's own tests run, and
 * saves the resulting cookie to `storageState`. The `admin` project then
 * declares `dependencies: ["setup"]` + `use.storageState` (see
 * playwright.config.ts), so every existing `admin-*.spec.ts` file's
 * browser context starts already authenticated — this is the entire
 * mechanism that lets those 19 pre-existing specs stay at zero
 * modification even though apps/admin now has a real login wall in
 * front of every route.
 *
 * `demo-super` (super_administrator), not a narrower role: the existing
 * specs collectively exercise all 16 admin entry points
 * (`admin-route-access.ts`'s ADMIN_ROUTES), several of which are
 * `super_administrator`-only (/roles, /permissions, /departments,
 * /groups, /usage) — a narrower seeded role would 403 on those and
 * break specs this story is required to leave untouched.
 */
setup("authenticate as demo-super", async ({ page }) => {
  await loginAs(page, { username: "demo-super" });
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
