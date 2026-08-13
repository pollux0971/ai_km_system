import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S007 critical flow: multi-line keyboard behavior on the message
 * composer (S06). Uses real keyboard simulation (page.keyboard.press)
 * rather than component-level fireEvent.keyDown — jsdom's fireEvent
 * doesn't simulate a textarea's native newline insertion, so proving
 * Shift+Enter actually inserts a visible newline needs a real browser.
 * Navigation after login always uses in-app link clicks, never
 * page.goto() — see conversations.spec.ts's file doc comment for why.
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

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

test("E03-S007: Shift+Enter inserts a newline instead of submitting", async ({ page }) => {
  await openConversation(page);

  const composer = page.getByLabel("訊息");
  await composer.click();
  await page.keyboard.type("第一行");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("第二行");

  await expect(composer).toHaveValue("第一行\n第二行");
});

test("E03-S007: Enter (without Shift) submits and clears the draft", async ({ page }) => {
  await openConversation(page);

  const composer = page.getByLabel("訊息");
  await composer.click();
  await page.keyboard.type("這是一則訊息");
  await page.keyboard.press("Enter");

  await expect(composer).toHaveValue("");
  await expect(page.getByRole("button", { name: "送出" })).toBeDisabled();
});

test("E03-S007: Enter on an empty composer does not submit — it falls back to native newline insertion, and submit stays disabled", async ({ page }) => {
  await openConversation(page);

  const composer = page.getByLabel("訊息");
  await composer.click();
  await page.keyboard.press("Enter");

  // Native <textarea> behavior for Enter is "insert a newline" unless
  // JS intercepts it — our handler only intercepts when there's a
  // valid (non-whitespace) draft to submit, so on an empty draft this
  // falls through to that native behavior. The resulting "\n" is still
  // whitespace-only (`"\n".trim() === ""`), so the fail-closed
  // guarantee (AC2: submit stays disabled) holds regardless.
  await expect(composer).toHaveValue("\n");
  await expect(page.getByRole("button", { name: "送出" })).toBeDisabled();
});
