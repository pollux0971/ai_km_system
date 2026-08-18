import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S008 critical flow: the file attachment picker on the message
 * composer. No upload happens anywhere — this only proves the
 * client-side selection/preview/removal lifecycle and how it interacts
 * with the composer's overall submit validity. Navigation after login
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

// Scoped to the composer's own <form> — the sidebar nav also renders as
// a <ul>/<li> list, so an unscoped page.getByRole("listitem") matches
// both.
function composerForm(page: import("@playwright/test").Page) {
  return page.locator("form");
}

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

test("E03-S008: attaching a file shows it in the preview list and enables submit with no text", async ({ page }) => {
  await openConversation(page);

  await expect(page.getByRole("button", { name: "送出" })).toBeDisabled();

  await page.getByLabel("附件").setInputFiles({
    name: "報表.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("fake pdf content"),
  });

  await expect(composerForm(page).getByRole("listitem")).toHaveText(/報表\.pdf/);
  await expect(page.getByRole("button", { name: "送出" })).toBeEnabled();
});

test("E03-S008: removing an attachment takes it out of the list and disables submit again", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("附件").setInputFiles({
    name: "a.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect(page.getByRole("button", { name: "送出" })).toBeEnabled();

  await page.getByRole("button", { name: "移除 a.txt" }).click();

  await expect(composerForm(page).getByRole("listitem")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "送出" })).toBeDisabled();
});

test("E03-S008: submitting an attachment-only message clears both the text draft and the attachment list", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("附件").setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from("fake png content"),
  });
  await page.getByRole("button", { name: "送出" }).click();

  await expect(composerForm(page).getByRole("listitem")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "送出" })).toBeDisabled();
});

test("E03-S008: multiple attachments can be selected and listed together", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("附件").setInputFiles([
    { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("a") },
    { name: "b.txt", mimeType: "text/plain", buffer: Buffer.from("b") },
  ]);

  await expect(composerForm(page).getByRole("listitem")).toHaveCount(2);
});
