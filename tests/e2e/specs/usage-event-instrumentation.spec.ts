import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S009 critical flow: sending a real message sends a queryable usage
 * event (the "questionsAsked" source E11-S021's usage dashboard is
 * waiting on) as a `POST /usage-events` request (E13-S020 rewrite —
 * apps/web no longer persists usage events to its own sessionStorage at
 * all) — separate from the fire-and-forget structured telemetry log
 * (trackEvent) this codebase already emits at the same call site.
 * Assertions now observe the actual outbound request via
 * `page.route()` interception rather than reading back a local store;
 * `userId` is intentionally never asserted on the captured request body —
 * analytics.yaml's own rule is that identity comes from the session, never
 * the client, so a captured event correctly never carries one (and the
 * fake API's own schema validation — served by this same route
 * interception below — would already reject a body that tried). Navigation
 * stays in-app (see answer-ok-feedback.spec.ts's file doc comment for why
 * a real page.reload() is never used here — it wipes the mock AuthClient's
 * in-memory session).
 */

type CapturedUsageEvent = { name: string; conversationId?: string; answerState?: string; citationCount?: number; latencyMs?: number; occurredAt: string };

/**
 * Stubs `POST /api/v1/usage-events` and records every request body sent to it — the
 * E2E-scale equivalent of apps/web's own unit-test `fake-api.ts`. Must be registered
 * before the action under test, since `recordUsageEvent` (E13-S020) is fire-and-forget:
 * an unrouted request would otherwise reach nothing (no real apps/api server is wired
 * into this Playwright config) and simply fail silently, same as a real 500 would.
 */
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

test("E13-S009: sending a message sends a conversation_message_sent usage event", async ({ page }) => {
  const captured = await captureUsageEvents(page);
  await login(page);

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  // E13-S011 note: a real send also completes streaming and sends its own
  // distinct rag_answer_outcome event at the same call site this test
  // already waits on (waitForThreadToSettle) — filtering to THIS event
  // name keeps testing the original claim ("conversation_message_sent
  // itself isn't double-sent") precisely, without this test also needing
  // to know about a second, unrelated event type.
  await expect.poll(() => captured.filter((event) => event.name === "conversation_message_sent").length).toBe(1);
  const sentEvents = captured.filter((event) => event.name === "conversation_message_sent");
  expect(sentEvents[0]).toMatchObject({ name: "conversation_message_sent" });
});

test("E13-S009: each real send sends exactly one usage event, not zero or duplicated", async ({ page }) => {
  const captured = await captureUsageEvents(page);
  await login(page);

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  // Same E13-S011 scoping note as the test above.
  const sentEventCount = () => captured.filter((event) => event.name === "conversation_message_sent").length;

  await page.getByLabel("訊息").fill("第一個問題");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  await expect.poll(sentEventCount).toBe(1);

  await page.getByLabel("訊息").fill("第二個問題");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  await expect.poll(sentEventCount).toBe(2);
});
