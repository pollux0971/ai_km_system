import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S015 critical flow: from the citation preview drawer (E03-S014),
 * clicking "開啟原始來源" navigates (same tab) to a dedicated
 * /citations/[id] page showing that citation's File/Page plus an
 * explicit placeholder notice standing in for a real document viewer.
 * Navigation after login always uses in-app link clicks, never
 * page.goto() — see conversations.spec.ts's file doc comment for why:
 * the mock AuthClient's session is an in-memory closure with no cookie/
 * storage backing, so any page.goto() (a hard reload) wipes it. Unlike
 * route-guards.spec.ts's use of page.goto() after login (safe there
 * only because those routes have no matching page.tsx at all, so
 * Next.js's root not-found short-circuits before the (app) layout's
 * SessionGate ever runs), /citations/[id]'s dynamic segment matches a
 * REAL page inside the authenticated layout — a page.goto() there would
 * lose the session and redirect to /login instead of exercising this
 * page at all. There is also no legitimate in-app link to an invalid
 * citation id (the drawer's link only ever points at an id it just
 * successfully loaded), so the NOT_FOUND render for an unknown id is
 * intentionally left to citation-source-view.test.tsx's unit coverage
 * rather than reached for here via an unrepresentative workaround.
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

function sidebarNav(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: "主導覽" });
}

async function waitForThreadToSettle(page: import("@playwright/test").Page) {
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0, { timeout: 20000 });
}

test("E03-S015: opening a citation's source navigates to a dedicated page showing File/Page and an honest placeholder notice", async ({
  page,
}) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await page.getByRole("button", { name: "檢視引用來源 1" }).click();
  await expect(page.getByRole("region", { name: "引用來源預覽" })).toBeVisible();

  await page.getByRole("link", { name: "開啟原始來源" }).click();
  await page.waitForURL((url) => url.pathname === "/citations/1");

  await expect(page.getByRole("heading", { name: "原始來源" })).toBeVisible();
  await expect(page.getByText("檔案", { exact: true })).toBeVisible();
  await expect(page.getByText("頁碼", { exact: true })).toBeVisible();
  await expect(page.getByText(/真正的文件內容檢視器依賴 Object Storage/)).toBeVisible();
  await expect(page.getByText("模擬來源文件 1")).toBeVisible();
});
