import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S030 critical flow. SOURCE_BASELINE.md gives this story only a
 * bare title, "E03-S30 No Evidence UX"; the epic's expanded title
 * ("No-evidence/abstention UX") names a capability E03-S021 already
 * fully delivers (classification, fallback content, badge, its own
 * dedicated E2E coverage in answer-state.spec.ts). Per
 * AI_KM_BMAD_High_Granularity/policies/ATOMIC_STORY_BOUNDARIES.md's
 * explicit prohibition on inventing unrequested product behavior, this
 * story's genuine increment is verifying two real interactions between
 * S21's abstention states and LATER features that never existed at the
 * same time before now: citation rendering (S13, predates S21 — a
 * negative check) and Copy Answer (S27, postdates S21 — never
 * exercised against a non-ANSWERED message before). Full /advisor
 * reasoning trail in docs/stories/E03-S030.md. Navigation after login
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

async function waitForThreadToSettle(page: import("@playwright/test").Page) {
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0, { timeout: 20000 });
}

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

const NO_EVIDENCE_FALLBACK = "（模擬回覆）在您有權限的知識範圍內，找不到足夠的依據可以回答這個問題。";

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
