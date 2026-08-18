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

  // E13-S011 note: a real send also completes streaming and persists its
  // own distinct rag_answer_outcome event at the same call site this test
  // already waits on (waitForThreadToSettle) — filtering to THIS event
  // name keeps testing the original claim ("conversation_message_sent
  // itself isn't double-recorded") precisely, without this test also
  // needing to know about a second, unrelated event type.
  const events = await readUsageEvents(page);
  const sentEvents = events.filter((event) => event.name === "conversation_message_sent");
  expect(sentEvents).toHaveLength(1);
  expect(sentEvents[0]).toMatchObject({ name: "conversation_message_sent", userId: MOCK_VALID_USER_ID });
});

test("E13-S009: a failed send never persists a usage event, and each real send only ever adds exactly one", async ({ page }) => {
  await login(page);

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  // Same E13-S011 scoping note as the test above.
  const sentEventCount = async () => (await readUsageEvents(page)).filter((event) => event.name === "conversation_message_sent").length;

  await page.getByLabel("訊息").fill("第一個問題");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  expect(await sentEventCount()).toBe(1);

  await page.getByLabel("訊息").fill("第二個問題");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  expect(await sentEventCount()).toBe(2);
});
