import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E01-S017 route-level guards. 401 (session-gate.spec.ts, since E01-S004)
 * and the unauthenticated-404 case (smoke.spec.ts, since E01-S001) are
 * already covered — this file covers what's net-new: 404 combined with an
 * authenticated session, and the 403 guard's fail-closed-by-absence
 * behavior for a role-restricted route that has no page yet
 * (/knowledge, /maintenance, /erp are E05/E07/E09's own first stories —
 * this repo doesn't get ahead of them). The 403 guard's actual deny
 * rendering (once such a page exists) is covered at the component level
 * in apps/web/src/app/(app)/_components/role-guard.test.tsx and
 * apps/web/src/app/(app)/layout.test.tsx — there is no real restricted
 * page today to exercise that render in a full browser.
 */

async function loginAsGeneralUser(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

test("E01-S017: an authenticated user hitting an unknown route still falls through to not-found (not a crash or a permission page)", async ({
  page,
}) => {
  await loginAsGeneralUser(page);

  await page.goto("/this-route-does-not-exist");

  await expect(page.getByRole("heading", { name: "頁面不存在" })).toBeVisible();
  // The (app) shell's chrome must not leak onto the root not-found page.
  await expect(page.getByRole("navigation", { name: "主導覽" })).not.toBeVisible();
});

test("E01-S017: a role-restricted route with no page built yet (/maintenance) safely falls through to not-found for a user without that role, not an error", async ({
  page,
}) => {
  await loginAsGeneralUser(page);

  await page.goto("/maintenance");

  await expect(page.getByRole("heading", { name: "頁面不存在" })).toBeVisible();
});
