import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S029 critical flow: the file-processing status shown while an
 * attached file is being (mock-)processed, and the distinct failure
 * path for a filename carrying the mock trigger — both within an
 * existing conversation's composer (E03-S008/S009) and via the E03-S028
 * file-chat entry flow, which reuses the same classification check.
 * Navigation after login always uses in-app link clicks, never
 * page.goto() — see conversations.spec.ts's file doc comment for why.
 */

// Mirrors lib/file-processing.ts's MOCK_FILE_PROCESSING_FAILURE_TRIGGER
// literal — kept as a plain string here (not imported) since this spec
// runs against the built app, not the source module directly, matching
// how other E2E specs reference S021's MOCK_ANSWER_STATE_TRIGGERS-style
// mock markers by their literal value.
const FAILURE_TRIGGER = "[模擬:PROCESSING_FAILED]";

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

test("E03-S029: sending a message with an attachment shows 檔案處理中… before it settles with the attachment shown", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("附件").setInputFiles({
    name: "報表.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("fake pdf content"),
  });
  await page.getByLabel("訊息").fill("這是什麼？");
  await page.getByRole("button", { name: "送出" }).click();

  await expect(page.getByText("檔案處理中…")).toBeVisible();
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0, { timeout: 20000 });
  await expect(page.getByText("（附件：報表.pdf）")).toBeVisible();
});

test("E03-S029: a filename carrying the mock processing-failure trigger shows a distinct 檔案處理失敗 error with a 重新處理 retry, and never sends the message", async ({
  page,
}) => {
  await openConversation(page);

  await page.getByLabel("附件").setInputFiles({
    name: `損毀檔案${FAILURE_TRIGGER}.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.from("fake pdf content"),
  });
  await page.getByLabel("訊息").fill("這是什麼？");
  await page.getByRole("button", { name: "送出" }).click();

  // The attempted file's name is still shown alongside the failure —
  // that's correct, desired behavior (the user can see WHICH file
  // failed), not evidence the message went through.
  await expect(page.getByText("檔案處理失敗")).toBeVisible();
  await expect(page.getByText(`（附件：損毀檔案${FAILURE_TRIGGER}.pdf）`)).toBeVisible();
  const retryButton = page.getByRole("button", { name: "重新處理" });
  await expect(retryButton).toBeVisible();
  // The mock failure is deterministic (same filename -> same outcome
  // every time, matching E03-S021's answer-state trigger precedent) —
  // retrying re-processes and fails again, rather than silently
  // succeeding or getting stuck.
  await retryButton.click();
  await expect(page.getByText("檔案處理失敗")).toBeVisible();

  // The failed attempt is purely ephemeral (never persisted) — leaving
  // and returning to this same conversation via in-app link clicks
  // (not page.reload()/page.goto() — see this file's own doc comment
  // for why a hard reload would wipe the mock session instead of
  // proving anything about message persistence) forces MessageThread
  // to re-fetch from the store, proving the message never actually
  // made it in, not just that the UI currently shows a failure state.
  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
  await expect(page.getByText("這是什麼？")).toHaveCount(0);
});

test("E03-S029: the file-chat entry flow (E03-S028) also rejects a file carrying the mock processing-failure trigger, without creating a conversation", async ({
  page,
}) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "上傳檔案開始對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations/new-file");

  await page.getByLabel("附件").setInputFiles({
    name: `損毀檔案${FAILURE_TRIGGER}.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.from("fake pdf content"),
  });
  await page.getByRole("button", { name: "開始對話" }).click();

  await expect(page.getByText("檔案處理失敗，請確認檔案後再試一次。")).toBeVisible();
  // Never left /conversations/new-file — no conversation was created to
  // redirect into.
  expect(page.url()).toContain("/conversations/new-file");
});
