import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S011 critical flow: a real, successfully-streamed assistant reply
 * sends a rag_answer_outcome usage event carrying the two RAG-adjacent
 * facts already genuinely observable at mock scale — the reply's
 * AnswerState classification (E03-S021) and its distinct citation count
 * (E03-S014's `[N]` markers) — to the same `POST /usage-events` endpoint
 * usage-event-instrumentation.spec.ts (E13-S009) already exercises.
 * E13-S020 rewrite: apps/web no longer persists usage events to its own
 * sessionStorage — assertions observe the actual outbound request via
 * `page.route()` interception. Real RAG evaluation (retrieval recall,
 * forbidden-source leak rate) is out of scope — that's E04 (Team B)'s
 * domain; this only records what the existing mock RAG pipeline already
 * surfaces. Navigation stays in-app for the same session-persistence
 * reason usage-event-instrumentation.spec.ts's doc comment explains.
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

function ragOutcomeEvents(captured: CapturedUsageEvent[]): CapturedUsageEvent[] {
  return captured.filter((event) => event.name === "rag_answer_outcome");
}

test("E13-S011: a normal answer sends a rag_answer_outcome event with ANSWERED and its real citation count", async ({ page }) => {
  const captured = await captureUsageEvents(page);
  await login(page);

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  expect(ragOutcomeEvents(captured)).toHaveLength(0);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await expect.poll(() => ragOutcomeEvents(captured).length).toBe(1);
  // MOCK_REPLY (streaming.ts) embeds exactly one `[1]` citation marker.
  expect(ragOutcomeEvents(captured)[0]).toMatchObject({ answerState: "ANSWERED", citationCount: 1 });
});

test("E13-S011: a NO_EVIDENCE (abstained) answer sends its real state with a zero citation count, not defaulted to ANSWERED/1", async ({
  page,
}) => {
  const captured = await captureUsageEvents(page);
  await login(page);

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await page.getByLabel("訊息").fill("保固期限是多久？ [模擬:NO_EVIDENCE]");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await expect.poll(() => ragOutcomeEvents(captured).length).toBe(1);
  expect(ragOutcomeEvents(captured)[0]).toMatchObject({ answerState: "NO_EVIDENCE", citationCount: 0 });
});
