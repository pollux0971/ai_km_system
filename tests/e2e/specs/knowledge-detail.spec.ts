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
 *
 * E05-S028 "KB usage stats thin slice" adds two aggregate counts —
 * 處理失敗文件數/已封存文件數 — computed from data this page already
 * fetches (see knowledge-detail.tsx's own doc comment for why these,
 * not a query/access-frequency metric nobody in this codebase can
 * honestly compute). This test builds up real mixed document state
 * (upload a mock-triggered failure, archive an existing document)
 * through the documents list page, then confirms the detail page's
 * counts genuinely reflect it — not just that the labels render.
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

test("E05-S028: 處理失敗文件數/已封存文件數 genuinely reflect a mix of failed and archived documents, not just the total count", async ({
  page,
}) => {
  await openKnowledgeList(page);
  await page.getByRole("link", { name: "產品保固政策" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  await expect(page.getByText("文件:", { exact: false })).toContainText("3 份文件");
  await expect(page.getByText("處理失敗文件數:", { exact: false })).toContainText("0 份");
  await expect(page.getByText("已封存文件數:", { exact: false })).toContainText("0 份");

  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  await page.getByLabel("上傳文件").setInputFiles({
    name: "損毀報告[模擬:KB_PROCESSING_FAILED].pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("file content"),
  });
  await page.getByRole("button", { name: "上傳", exact: true }).click();
  await expect(page.getByText(/上傳中|解析中|索引中/)).not.toBeVisible();
  await expect(page.getByText("處理失敗")).toBeVisible();

  const targetItem = page.getByText("理賠申請流程.docx").locator("..");
  await targetItem.getByRole("button", { name: "封存文件" }).click();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  await expect(page.getByText("文件:", { exact: false })).toContainText("3 份文件");
  await expect(page.getByText("處理失敗文件數:", { exact: false })).toContainText("1 份");
  await expect(page.getByText("已封存文件數:", { exact: false })).toContainText("1 份");
});
