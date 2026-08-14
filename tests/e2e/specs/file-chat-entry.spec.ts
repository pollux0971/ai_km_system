import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S028 critical flow: starting a brand-new conversation from an
 * uploaded file via the dedicated /conversations/new-file entry point,
 * distinct from E03-S001's plain "開始新對話". Navigation after login
 * always uses in-app link clicks, never page.goto() — see
 * conversations.spec.ts's file doc comment for why. File selection uses
 * an in-memory synthetic buffer (no real file on disk), matching
 * file-attachment-picker.spec.ts's own established pattern.
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

test("E03-S028: uploading a file and starting a conversation lands directly inside it, showing the attached file", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  await page.getByRole("link", { name: "上傳檔案開始對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations/new-file");

  await expect(page.getByRole("button", { name: "開始對話" })).toBeDisabled();
  await page.getByLabel("附件").setInputFiles({
    name: "報表.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("fake pdf content"),
  });
  await expect(page.getByRole("button", { name: "開始對話" })).toBeEnabled();

  await page.getByRole("button", { name: "開始對話" }).click();

  // Lands inside the new conversation itself, not back on the list.
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname) && url.pathname !== "/conversations/new-file");
  await expect(page.getByRole("heading", { name: "新對話", level: 1 })).toBeVisible();
  await expect(page.getByText("（附件：報表.pdf）")).toBeVisible();

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await expect(page.getByText("新對話").first()).toBeVisible();
});
