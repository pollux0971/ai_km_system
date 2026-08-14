import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E05-S004 critical flow: editing a knowledge base's name/description
 * through the "編輯" entry point this story adds to each item in
 * KnowledgeList. Navigation after login always uses in-app link clicks,
 * never page.goto() — see conversations.spec.ts's file doc comment for
 * why (the mock AuthClient's session is a plain in-memory closure
 * variable; page.goto() is a hard reload that wipes it).
 *
 * A "visiting an edit URL for an unknown id shows a not-found message"
 * E2E test used to live here and was removed, not skipped, after
 * confirming why it can't work the way route-guards.spec.ts's own
 * direct-goto not-found tests do: /this-route-does-not-exist (that
 * file's target) matches NO page.tsx anywhere, so Next.js never mounts
 * the (app) layout's SessionGate for it at all — the resulting 404 is
 * genuinely auth-independent. /knowledge/{id}/edit, by contrast, matches
 * this story's own real page.tsx, which IS nested inside (app) — so
 * page.goto() there first goes through SessionGate, which (correctly,
 * given the session was just wiped by the hard reload) redirects to
 * /login instead of ever reaching this component's own data-driven
 * not-found state. Confirmed directly: the assertion failed with the
 * page showing the 登入 heading, not this route's content. There is no
 * in-app link to an invalid id to click instead (one can't exist by
 * definition), so this specific sub-case has no valid E2E path under
 * this mock's architecture. It's still fully covered, genuinely (not a
 * shell test), at the component level — see
 * _components/edit-knowledge-base.test.tsx's own "shows a distinct
 * not-found state" test, which drives the exact same code path via a
 * mocked getKnowledgeBase() returning `{ ok: true, value: null }`.
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

test("E05-S004: editing a knowledge base's name and description updates the list", async ({ page }) => {
  await openKnowledgeList(page);

  await page.locator("li", { hasText: "產品保固政策" }).getByRole("link", { name: "編輯" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/edit$/.test(url.pathname));

  await expect(page.getByLabel("知識庫名稱")).toHaveValue("產品保固政策");
  await page.getByLabel("知識庫名稱").fill("產品保固政策（已更新）");
  await page.getByLabel("說明").fill("更新後的保固說明內容。");
  await page.getByRole("button", { name: "儲存" }).click();

  await page.waitForURL((url) => url.pathname === "/knowledge");
  await expect(page.getByText("產品保固政策（已更新）")).toBeVisible();
  await expect(page.getByText("更新後的保固說明內容。")).toBeVisible();
  await expect(page.getByText("產品保固政策", { exact: true })).toHaveCount(0);
});

test("E05-S004: the save button stays disabled if the name is cleared to empty", async ({ page }) => {
  await openKnowledgeList(page);

  await page.locator("li", { hasText: "設備維修標準作業程序" }).getByRole("link", { name: "編輯" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/edit$/.test(url.pathname));

  await page.getByLabel("知識庫名稱").fill("   ");
  await expect(page.getByRole("button", { name: "儲存" })).toBeDisabled();
  await expect(page).toHaveURL((url) => /^\/knowledge\/.+\/edit$/.test(url.pathname));
});

test("E05-S004: clicking cancel returns to the list without saving any changes", async ({ page }) => {
  await openKnowledgeList(page);

  await page.locator("li", { hasText: "人力資源與請假規範" }).getByRole("link", { name: "編輯" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/edit$/.test(url.pathname));

  await page.getByLabel("知識庫名稱").fill("這個改動不應該被儲存");
  await page.getByRole("link", { name: "取消" }).click();

  await page.waitForURL((url) => url.pathname === "/knowledge");
  await expect(page.getByText("人力資源與請假規範")).toBeVisible();
  await expect(page.getByText("這個改動不應該被儲存")).toHaveCount(0);
});
