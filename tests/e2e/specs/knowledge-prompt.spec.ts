import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E05-S008 critical flow: binding a prompt to a knowledge base via the
 * text editor at /knowledge/[id]/prompt, and confirming the detail page
 * (E05-S005) reflects it (as a "已設定" indicator, not the prompt text
 * itself — see knowledge-detail.tsx's own doc comment for why).
 * Navigation after login always uses in-app link clicks, never
 * page.goto() — see conversations.spec.ts's file doc comment for why
 * (the mock AuthClient's session is a plain in-memory closure variable;
 * page.goto() is a hard reload that wipes it).
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

test("E05-S008: binding a prompt saves it and the detail page shows 已設定", async ({ page }) => {
  await openKnowledgeDetail(page, "產品保固政策");

  const summary = page.getByText("綁定提示詞:", { exact: false });
  await expect(summary).toContainText("尚未設定");

  await page.getByRole("link", { name: "提示詞設定" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/prompt$/.test(url.pathname));

  await page.getByLabel("綁定提示詞(選填)").fill("請用友善、簡潔的語氣回答保固相關問題。");
  await page.getByRole("button", { name: "儲存" }).click();
  await expect(page.getByRole("status")).toHaveText("已儲存。");

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  await expect(page.getByText("綁定提示詞:", { exact: false })).toContainText("已設定");
});

test("E05-S008: reopening the prompt editor shows the previously saved prompt", async ({ page }) => {
  await openKnowledgeDetail(page, "設備維修標準作業程序");

  await page.getByRole("link", { name: "提示詞設定" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/prompt$/.test(url.pathname));

  await page.getByLabel("綁定提示詞(選填)").fill("請引用相關的維修 SOP 條號。");
  await page.getByRole("button", { name: "儲存" }).click();
  await expect(page.getByRole("status")).toHaveText("已儲存。");

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await page.getByRole("link", { name: "提示詞設定" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/prompt$/.test(url.pathname));

  await expect(page.getByLabel("綁定提示詞(選填)")).toHaveValue("請引用相關的維修 SOP 條號。");
});
