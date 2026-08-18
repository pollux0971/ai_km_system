import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E05-S006 critical flow: setting a knowledge base's visible-to-roles
 * permission via the checkbox editor at /knowledge/[id]/permissions,
 * and confirming the detail page (E05-S005) reflects it. Navigation
 * after login always uses in-app link clicks, never page.goto() — see
 * conversations.spec.ts's file doc comment for why (the mock
 * AuthClient's session is a plain in-memory closure variable; page.goto()
 * is a hard reload that wipes it).
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

async function openKnowledgeDetail(page: import("@playwright/test").Page, name: string) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "知識庫" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge");
  // ux/enterprise-polish added a sidebar "歷史對話" rail listing every
  // active conversation's title — the seeded "產品保固政策詢問"
  // conversation makes an unscoped getByRole("link", { name }) ambiguous
  // (substring match) when `name` is "產品保固政策". Scoped to <main>,
  // matching this codebase's established fix for the same collision
  // (see home-dashboard.spec.ts's dashboardMain).
  await page.getByRole("main").getByRole("link", { name }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
}

test("E05-S006: checking a role on the permission editor saves immediately and the detail page reflects it", async ({ page }) => {
  await openKnowledgeDetail(page, "產品保固政策");

  // Scoped to the "可存取角色:" summary specifically — E05-S008 added a
  // second, independent "尚未設定" summary (bound prompt) that's ALSO
  // unconfigured for a freshly-seeded knowledge base, so a bare
  // getByText("尚未設定") is ambiguous (matches both) as of that story.
  const roleSummary = page.getByText("可存取角色:", { exact: false });
  await expect(roleSummary).toContainText("尚未設定");

  await page.getByRole("link", { name: "權限設定" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/permissions$/.test(url.pathname));

  await page.getByRole("checkbox", { name: "維修工程師" }).check();
  await expect(page.getByRole("checkbox", { name: "維修工程師" })).toBeChecked();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  await expect(page.getByText("維修工程師", { exact: false })).toBeVisible();
  await expect(roleSummary).not.toContainText("尚未設定");
});

test("E05-S006: unchecking every role returns the knowledge base to 尚未設定", async ({ page }) => {
  await openKnowledgeDetail(page, "設備維修標準作業程序");

  await page.getByRole("link", { name: "權限設定" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/permissions$/.test(url.pathname));

  const checkbox = page.getByRole("checkbox", { name: "業務/採購" });
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  // Scoped for the same reason as the test above.
  await expect(page.getByText("可存取角色:", { exact: false })).toContainText("尚未設定");
});
