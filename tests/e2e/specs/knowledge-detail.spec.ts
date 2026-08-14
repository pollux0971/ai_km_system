import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E05-S005 critical flow: viewing a knowledge base's detail page via the
 * name link KnowledgeList now provides (deferred at E05-S001, fulfilled
 * here). Navigation after login always uses in-app link clicks, never
 * page.goto() — see conversations.spec.ts's file doc comment for why
 * (the mock AuthClient's session is a plain in-memory closure variable;
 * page.goto() is a hard reload that wipes it). This also means, same as
 * knowledge-edit.spec.ts's own file doc comment already explains for
 * E05-S004, that a "direct-goto an unknown id shows not-found" E2E test
 * isn't attempted here either — this route is real and nested inside
 * (app), so it goes through SessionGate the same way
 * /knowledge/[id]/edit does. That state is covered, genuinely, at the
 * component level by knowledge-detail.test.tsx's own
 * "shows a distinct not-found state" test.
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

async function openKnowledgeList(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "知識庫" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge");
}

test("E05-S005: clicking a knowledge base's name shows its detail page", async ({ page }) => {
  await openKnowledgeList(page);

  await page.getByRole("link", { name: "產品保固政策" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  await expect(page.getByRole("heading", { name: "產品保固政策", level: 1 })).toBeVisible();
  await expect(page.getByText("保固期限、涵蓋範圍與理賠流程等相關文件。")).toBeVisible();
});

test("E05-S005: the 編輯 link on the detail page navigates to the edit page for the same knowledge base", async ({ page }) => {
  await openKnowledgeList(page);

  await page.getByRole("link", { name: "設備維修標準作業程序" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  await page.getByRole("link", { name: "編輯" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/edit$/.test(url.pathname));

  await expect(page.getByLabel("知識庫名稱")).toHaveValue("設備維修標準作業程序");
});
