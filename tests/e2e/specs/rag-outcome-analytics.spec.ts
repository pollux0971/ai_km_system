import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USER_ID, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S011 critical flow: a real, successfully-persisted assistant reply
 * records a rag_answer_outcome usage event carrying the two RAG-adjacent
 * facts already genuinely observable at mock scale — the reply's
 * AnswerState classification (E03-S021) and its distinct citation count
 * (E03-S014's `[N]` markers) — into the same usage-events.ts store
 * usage-event-instrumentation.spec.ts (E13-S009) already exercises.
 * Real RAG evaluation (retrieval recall, forbidden-source leak rate) is
 * out of scope — that's E04 (Team B)'s domain; this only records what
 * the existing mock RAG pipeline already surfaces. Navigation stays
 * in-app for the same session-persistence reason
 * usage-event-instrumentation.spec.ts's doc comment explains.
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

async function readRagOutcomeEvents(page: import("@playwright/test").Page) {
  return page.evaluate((key) => {
    const raw = window.sessionStorage.getItem(key);
    const events = raw
      ? (JSON.parse(raw) as Array<{ name: string; userId: string; answerState?: string; citationCount?: number }>)
      : [];
    return events.filter((event) => event.name === "rag_answer_outcome");
  }, USAGE_EVENTS_KEY);
}

test("E13-S011: a normal answer persists a rag_answer_outcome event with ANSWERED and its real citation count", async ({ page }) => {
  await login(page);

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  expect(await readRagOutcomeEvents(page)).toHaveLength(0);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const outcomes = await readRagOutcomeEvents(page);
  expect(outcomes).toHaveLength(1);
  // MOCK_REPLY (streaming.ts) embeds exactly one `[1]` citation marker.
  expect(outcomes[0]).toMatchObject({ userId: MOCK_VALID_USER_ID, answerState: "ANSWERED", citationCount: 1 });
});

test("E13-S011: a NO_EVIDENCE (abstained) answer records its real state with a zero citation count, not defaulted to ANSWERED/1", async ({
  page,
}) => {
  await login(page);

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await page.getByLabel("訊息").fill("保固期限是多久？ [模擬:NO_EVIDENCE]");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const outcomes = await readRagOutcomeEvents(page);
  expect(outcomes).toHaveLength(1);
  expect(outcomes[0]).toMatchObject({ userId: MOCK_VALID_USER_ID, answerState: "NO_EVIDENCE", citationCount: 0 });
});
