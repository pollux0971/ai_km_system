import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USER_ID, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S013 critical flow: a real send-and-receive round trip persists a
 * non-negative, real-elapsed-time `latencyMs` on its own
 * `rag_answer_outcome` usage event (E13-S011's own event, extended here)
 * — the actual data this story's own aggregation (`computeAverageLatencyMs`,
 * usage-events.test.ts) and the `/latency` admin page (admin-latency.spec.ts)
 * are both built around. Navigation stays in-app (see
 * answer-ok-feedback.spec.ts's file doc comment for why a real
 * page.reload() is never used here).
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
    return raw ? (JSON.parse(raw) as Array<{ name: string; userId: string; latencyMs?: number }>) : [];
  }, USAGE_EVENTS_KEY);
}

test("E13-S013: a real answer persists a non-negative latencyMs on its rag_answer_outcome event", async ({ page }) => {
  await login(page);

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const events = await readUsageEvents(page);
  const outcomeEvents = events.filter((event) => event.name === "rag_answer_outcome");
  expect(outcomeEvents).toHaveLength(1);
  const outcome = outcomeEvents[0];
  if (!outcome) throw new Error("expected a rag_answer_outcome event");
  expect(outcome.userId).toBe(MOCK_VALID_USER_ID);
  expect(typeof outcome.latencyMs).toBe("number");
  expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);
});
