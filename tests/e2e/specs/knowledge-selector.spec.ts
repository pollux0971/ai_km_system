import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S003/S004 critical flow: the conversation detail page's knowledge
 * scope selector, upgraded from single-select (a `<select>`) to
 * multi-select (a checkbox group) in S004. Navigation after login
 * always uses in-app link clicks, never page.goto() — see
 * conversations.spec.ts's file doc comment for why.
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

test("E03-S004: opening a conversation shows its pre-selected knowledge scopes (multiple checked at once)", async ({
  page,
}) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  // Seed data: "產品保固政策詢問" has knowledgeScopes ["company", "qna"].
  // Scoped to <main> — the sidebar's own "歷史對話" rail also links to
  // this same conversation by the same title, so an unscoped getByRole
  // here is ambiguous.
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await expect(page.getByRole("checkbox", { name: "公司知識庫" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "問答庫" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "部門知識庫" })).not.toBeChecked();
});

test("E03-S004: checking multiple scopes and leaving one unchecked persists exactly that combination", async ({
  page,
}) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  // Seed data: "設備 E-204 錯誤代碼排查" has no knowledge scopes selected.
  // Scoped to <main> — the sidebar's own "歷史對話" rail also links to
  // this same conversation by the same title, so an unscoped getByRole
  // here is ambiguous.
  await page.getByRole("main").getByRole("link", { name: "設備 E-204 錯誤代碼排查" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
  const conversationUrl = page.url();

  await page.getByRole("checkbox", { name: "部門知識庫" }).check();
  await expect(page.getByRole("checkbox", { name: "部門知識庫" })).toBeChecked();
  await page.getByRole("checkbox", { name: "問答庫" }).check();
  await expect(page.getByRole("checkbox", { name: "問答庫" })).toBeChecked();

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  // Scoped to <main> — the sidebar's own "歷史對話" rail also links to
  // this same conversation by the same title, so an unscoped getByRole
  // here is ambiguous.
  await page.getByRole("main").getByRole("link", { name: "設備 E-204 錯誤代碼排查" }).click();
  await page.waitForURL(conversationUrl);

  await expect(page.getByRole("checkbox", { name: "部門知識庫" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "問答庫" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "公司知識庫" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "專案知識庫" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "個人知識庫" })).not.toBeChecked();
});

test("E03-S004: unchecking one previously-selected scope leaves the others checked", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  // Seed data: "產品保固政策詢問" has knowledgeScopes ["company", "qna"].
  // Scoped to <main> — the sidebar's own "歷史對話" rail also links to
  // this same conversation by the same title, so an unscoped getByRole
  // here is ambiguous.
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await page.getByRole("checkbox", { name: "公司知識庫" }).uncheck();

  await expect(page.getByRole("checkbox", { name: "公司知識庫" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "問答庫" })).toBeChecked();
});
