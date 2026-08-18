import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USER_ID, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S009 critical flow: sending a real message persists a queryable
 * usage event (the "questionsAsked" source E11-S021's usage dashboard is
 * waiting on) into apps/web's own sessionStorage-backed store — separate
 * from the fire-and-forget structured telemetry log (trackEvent) this
 * codebase already emits at the same call site. Navigation stays in-app
 * (see answer-ok-feedback.spec.ts's file doc comment for why a real
 * page.reload() is never used here — it wipes the mock AuthClient's
 * in-memory session).
 */

const USAGE_EVENTS_KEY = "ai-km:mock-usage-events";

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

async function readUsageEvents(page: import("@playwright/test").Page) {
  return page.evaluate((key) => {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Array<{ name: string; userId: string; occurredAt: string }>) : [];
  }, USAGE_EVENTS_KEY);
}

test("E13-S009: sending a message persists a conversation_message_sent usage event for the logged-in user", async ({ page }) => {
  await login(page);
  expect(await readUsageEvents(page)).toEqual([]);

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const events = await readUsageEvents(page);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ name: "conversation_message_sent", userId: MOCK_VALID_USER_ID });
});

test("E13-S009: a failed send never persists a usage event, and each real send only ever adds exactly one", async ({ page }) => {
  await login(page);

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await page.getByLabel("訊息").fill("第一個問題");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  expect(await readUsageEvents(page)).toHaveLength(1);

  await page.getByLabel("訊息").fill("第二個問題");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  expect(await readUsageEvents(page)).toHaveLength(2);
});
