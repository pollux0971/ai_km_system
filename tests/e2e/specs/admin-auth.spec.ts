import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

/**
 * E11-S026 — new spec, proving the real login/session wiring this story
 * adds. Every OTHER `admin-*.spec.ts` file stays authenticated via the
 * `admin` project's `storageState` (see auth.setup.ts); this file
 * deliberately overrides `storageState` per test group where it needs a
 * genuinely logged-out (or differently-authenticated) browser context.
 */

// All 16 entries ADMIN_ROUTES declares (apps/admin/src/lib/admin-route-access.ts),
// reused verbatim rather than re-derived — a drift between this list and
// that file would only ever make this test UNDER-cover, never falsely pass.
const ALL_ADMIN_ENTRIES = [
  "/",
  "/users",
  "/roles",
  "/permissions",
  "/departments",
  "/groups",
  "/knowledge",
  "/prompts",
  "/models",
  "/connectors",
  "/audit",
  "/feedback",
  "/document-failures",
  "/settings",
  "/usage",
  "/health",
];

test.describe("unauthenticated", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("AC1: any admin route redirects to /login?returnUrl=..., no page content rendered", async ({ page }) => {
    await page.goto("/users");
    await page.waitForURL((url) => url.pathname === "/login");
    expect(new URL(page.url()).searchParams.get("returnUrl")).toBe("/users");
    await expect(page.getByRole("heading", { name: "AI KM 管理主控台", level: 1 })).not.toBeVisible();
  });
});

test.describe("demo-user (no admin role)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("AC2: logs in successfully but gets 403 on the admin home, no management content", async ({ page }) => {
    await loginAs(page, { username: "demo-user" });
    await page.goto("/");
    await expect(page.getByText("FORBIDDEN")).toBeVisible();
    await expect(page.getByRole("heading", { name: "AI KM 管理主控台", level: 1 })).not.toBeVisible();
  });
});

test.describe("demo-super (super_administrator)", () => {
  // Uses the admin project's own default storageState (already demo-super).

  for (const href of ALL_ADMIN_ENTRIES) {
    test(`AC2: can reach ${href} (all 16 entries)`, async ({ page }) => {
      await page.goto(href);
      await expect(page.getByText("FORBIDDEN")).not.toBeVisible();
      await expect(page.getByText("UNAUTHORIZED")).not.toBeVisible();
    });
  }

  test("AC3: survives a hard reload while logged in", async ({ page }) => {
    await page.goto("/users");
    await page.reload();
    await expect(page.getByText("UNAUTHORIZED")).not.toBeVisible();
    await expect(page).toHaveURL(/\/users$/);
  });

  test("AC3: logout returns to /login and clears the session cookie", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "登出" }).click();
    await page.waitForURL((url) => url.pathname === "/login");

    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name === "ai_km_session");
    expect(sessionCookie).toBeUndefined();

    // Confirm the logout is real, not just a client-side navigation: a
    // hard reload of a protected route must bounce back to /login again.
    await page.goto("/users");
    await page.waitForURL((url) => url.pathname === "/login");
  });
});
