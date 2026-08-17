import { test, expect } from "@playwright/test";

/**
 * E11-S012 "Prompt admin" critical seam — same no-session-gate shape
 * admin-departments.spec.ts's own S009 test already establishes (see
 * admin-smoke.spec.ts's doc comment for why). No seeded prompts (see
 * prompts.ts's own doc comment for why), so this test starts from the
 * empty state and exercises the create path directly.
 */
test("E11-S012: navigating from the admin home to 提示詞管理 starts empty, and creating a prompt persists across a reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "提示詞管理" }).click();
  await page.waitForURL((url) => url.pathname === "/prompts");

  await expect(page.getByRole("heading", { name: "提示詞管理", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("尚無提示詞。", { exact: true })).toBeVisible();

  await page.getByLabel("提示詞名稱").fill("客服回覆語氣");
  await page.getByLabel("提示詞內容").fill("請以友善、簡潔的語氣回答客戶問題。");
  await page.getByRole("button", { name: "新增提示詞" }).click();

  await expect(page.getByText("客服回覆語氣", { exact: true })).toBeVisible();
  await expect(page.getByText("請以友善、簡潔的語氣回答客戶問題。", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("客服回覆語氣", { exact: true })).toBeVisible();
});
