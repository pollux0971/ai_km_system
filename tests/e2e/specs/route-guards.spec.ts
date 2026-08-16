import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E01-S017 route-level guards. 401 (session-gate.spec.ts, since E01-S004)
 * and the unauthenticated-404 case (smoke.spec.ts, since E01-S001) are
 * already covered — this file covers what's net-new: 404 combined with an
 * authenticated session. The 403 guard's fail-closed-by-absence behavior
 * for a role-restricted route with no page yet used to be covered here
 * too (first via /maintenance, then via /erp once E07-S001 built the real
 * /maintenance page — confirmed via `git log`), but E09-S001 has now
 * built the real /erp page. /maintenance and /erp were nav-items.ts's
 * only two role-restricted entries (roles other than "all") to begin
 * with — /knowledge was mentioned in this file's older comment only for
 * context (it started page-less too, before E05-S001, but is open to
 * every authenticated role, so it never qualified as a "role-restricted"
 * example). With both /maintenance and /erp now real pages, there is no
 * remaining role-restricted-but-unbuilt route left anywhere in the app to
 * target, so — exactly as this file's own comment predicted at the last
 * handoff — that test is removed rather than moved again. The 403
 * guard's actual deny rendering is, and always was, covered at the
 * component level in apps/web/src/app/(app)/_components/role-guard.test.tsx
 * (e.g. renderGuardAs(["general_user"], "/maintenance")), which needs no
 * real page to exist at all — that coverage is unaffected by this
 * removal. If a future epic adds a new role-restricted nav entry ahead of
 * its own first story shipping a page (the same pattern E01-S006/S009
 * used for /maintenance and /erp), a fresh page-less-route test can
 * target that instead.
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
