import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E05-S009 critical flow: binding a model to a knowledge base via the
 * instant-apply select at /knowledge/[id]/model, and confirming the
 * detail page (E05-S005) reflects it as the model's label. Navigation
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

test("E05-S009: binding a model saves it and the detail page shows its label", async ({ page }) => {
  await openKnowledgeDetail(page, "產品保固政策");

  const summary = page.getByText("綁定模型:", { exact: false });
  await expect(summary).toContainText("尚未綁定");

  await page.getByRole("link", { name: "模型設定" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/model$/.test(url.pathname));

  const select = page.getByRole("combobox", { name: "綁定模型" });
  await expect(select).toHaveValue("");
  await select.selectOption("advanced-local");
  await expect(select).toHaveValue("advanced-local");

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  await expect(page.getByText("綁定模型:", { exact: false })).toContainText("進階模型（地端）");
});

test("E05-S009: the cloud model option is visible but disabled, and re-opening the editor keeps the saved model", async ({
  page,
}) => {
  await openKnowledgeDetail(page, "設備維修標準作業程序");

  await page.getByRole("link", { name: "模型設定" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/model$/.test(url.pathname));

  const select = page.getByRole("combobox", { name: "綁定模型" });
  await expect(select.getByRole("option", { name: "雲端模型（尚未啟用）" })).toBeDisabled();

  await select.selectOption("standard");
  await expect(select).toHaveValue("standard");

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await page.getByRole("link", { name: "模型設定" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/model$/.test(url.pathname));

  await expect(page.getByRole("combobox", { name: "綁定模型" })).toHaveValue("standard");
});

test("E05-S009: selecting the unbound option clears a previously bound model", async ({ page }) => {
  await openKnowledgeDetail(page, "人力資源與請假規範");

  await page.getByRole("link", { name: "模型設定" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/model$/.test(url.pathname));

  const select = page.getByRole("combobox", { name: "綁定模型" });
  await select.selectOption("standard");
  await expect(select).toHaveValue("standard");

  await select.selectOption("");
  await expect(select).toHaveValue("");

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  await expect(page.getByText("綁定模型:", { exact: false })).toContainText("尚未綁定");
});
