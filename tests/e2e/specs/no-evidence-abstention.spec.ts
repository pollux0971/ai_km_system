import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S030 critical flow. SOURCE_BASELINE.md's own line for this story
 * (line 1251, inside «» — this document's reserved verbatim-quotation
 * marker) gives NO_EVIDENCE's exact required display sentence,
 * "找不到足夠企業資料支持此答案。" — missed during E03-S021 (which first
 * introduced this fallback content) and independent review caught the
 * gap during this story; lib/answer-state.ts's own doc comment has the
 * full account. Beyond correcting that text, this story's remaining
 * increment (E03-S021 already delivers classification/badge/E2E
 * coverage otherwise) is verifying two real interactions between S21's
 * abstention states and LATER features that never existed at the same
 * time before now: citation rendering (S13, predates S21 — a negative
 * check) and Copy Answer (S27, postdates S21 — never exercised against
 * a non-ANSWERED message before). Full /advisor reasoning trail in
 * docs/stories/E03-S030.md. Navigation after login always uses in-app
 * link clicks, never page.goto() — see conversations.spec.ts's file
 * doc comment for why.
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

async function waitForThreadToSettle(page: import("@playwright/test").Page) {
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0, { timeout: 20000 });
}

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

// SOURCE_BASELINE.md line 1251's own «»-quoted display text for this
// state, prefixed with the MOCK_REPLY-wide "(模擬回覆)" honest-mock
// label — see lib/answer-state.ts's own doc comment.
const NO_EVIDENCE_FALLBACK = "（模擬回覆）找不到足夠企業資料支持此答案。";

test("E03-S030: a NO_EVIDENCE (abstained) reply never renders a citation badge", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？ [模擬:NO_EVIDENCE]");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await expect(page.getByRole("main").getByText("查無依據", { exact: true })).toBeVisible();
  await expect(page.getByRole("superscript")).toHaveCount(0);
});

test("E03-S030: copying an abstained reply copies its honest fallback text, not the normal mock answer", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？ [模擬:NO_EVIDENCE]");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  await expect(page.getByRole("main").getByText("查無依據", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "複製" }).click();
  await expect(page.getByRole("button", { name: "已複製" })).toBeVisible();

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBe(NO_EVIDENCE_FALLBACK);
});
