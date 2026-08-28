import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S010 critical flow: starting a brand-new conversation — via either
 * the zero-interaction /conversations/new route or the file-first
 * /conversations/new-file route — sends a queryable `conversation_created`
 * usage event, the other half (alongside E13-S009's
 * `conversation_message_sent`) of the "questionsAsked"/DAU source
 * E11-S021's usage dashboard is waiting on. E13-S020 rewrite: apps/web no
 * longer persists usage events to its own sessionStorage — assertions
 * observe the actual `POST /usage-events` request via `page.route()`
 * interception (same helper as usage-event-instrumentation.spec.ts's file
 * doc comment explains), and `userId` is intentionally never asserted —
 * identity comes from the session, never the request body. Navigation
 * stays in-app (see answer-ok-feedback.spec.ts's file doc comment for why
 * a real page.reload() is never used here — it wipes the mock AuthClient's
 * in-memory session).
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

test("E13-S010: starting a new conversation from the zero-interaction route sends a conversation_created usage event", async ({
  page,
}) => {
  const captured = await captureUsageEvents(page);
  await login(page);

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  // Scoped to <main> — the sidebar renders its own "開始新對話" link too
  // (class="sidebar-new-chat"), so an unscoped getByRole here is
  // ambiguous between it and this page's own "開始新對話" link.
  await page.getByRole("main").getByRole("link", { name: "開始新對話" }).click();
  // Waits for the intermediate /conversations/new URL first — waiting
  // directly for "/conversations" here would resolve immediately against
  // the CURRENT (pre-click) URL, since it's the same pathname we started
  // on, racing ahead of the page's own createConversation()-then-redirect
  // effect entirely.
  await page.waitForURL((url) => url.pathname === "/conversations/new");
  await page.waitForURL((url) => url.pathname === "/conversations");

  await expect.poll(() => captured.length).toBe(1);
  expect(captured[0]).toMatchObject({ name: "conversation_created" });
});

test("E13-S010: starting a new conversation from the file-first entry route sends a conversation_created usage event", async ({
  page,
}) => {
  const captured = await captureUsageEvents(page);
  await login(page);

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "上傳檔案開始對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations/new-file");

  await page.getByLabel("附件").setInputFiles({
    name: "報表.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("dummy"),
  });
  await page.getByRole("button", { name: "開始對話" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname) && url.pathname !== "/conversations/new-file");

  await expect.poll(() => captured.length).toBe(1);
  expect(captured[0]).toMatchObject({ name: "conversation_created" });
});
