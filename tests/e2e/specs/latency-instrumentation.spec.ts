import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S013 critical flow: a real send-and-receive round trip sends a
 * non-negative, real-elapsed-time `latencyMs` on its own
 * `rag_answer_outcome` usage event (E13-S011's own event, extended here)
 * — the actual data this story's own aggregation (`computeAverageLatencyMs`,
 * usage-events.test.ts) and the `/latency` admin page (admin-latency.spec.ts)
 * are both built around. E13-S020 rewrite: apps/web no longer persists
 * usage events to its own sessionStorage — assertions observe the actual
 * outbound request via `page.route()` interception. Navigation stays
 * in-app (see answer-ok-feedback.spec.ts's file doc comment for why a real
 * page.reload() is never used here).
 */

type CapturedUsageEvent = { name: string; conversationId?: string; answerState?: string; citationCount?: number; latencyMs?: number; occurredAt: string };

async function captureUsageEvents(page: import("@playwright/test").Page): Promise<CapturedUsageEvent[]> {
  const captured: CapturedUsageEvent[] = [];
  await page.route("**/api/v1/usage-events", async (route) => {
    captured.push(route.request().postDataJSON() as CapturedUsageEvent);
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "e2e-stub-id" }) });
  });
  return captured;
}

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

test("E13-S013: a real answer sends a non-negative latencyMs on its rag_answer_outcome event", async ({ page }) => {
  const captured = await captureUsageEvents(page);
  await login(page);

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await expect.poll(() => captured.filter((event) => event.name === "rag_answer_outcome").length).toBe(1);
  const outcome = captured.find((event) => event.name === "rag_answer_outcome");
  if (!outcome) throw new Error("expected a rag_answer_outcome event");
  expect(typeof outcome.latencyMs).toBe("number");
  expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);
});
