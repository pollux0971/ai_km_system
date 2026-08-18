import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USER_ID, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S010 critical flow: starting a brand-new conversation — via either
 * the zero-interaction /conversations/new route or the file-first
 * /conversations/new-file route — persists a queryable
 * `conversation_created` usage event, the other half (alongside
 * E13-S009's `conversation_message_sent`) of the "questionsAsked"/DAU
 * source E11-S021's usage dashboard is waiting on. Navigation stays
 * in-app (see answer-ok-feedback.spec.ts's file doc comment for why a
 * real page.reload() is never used here — it wipes the mock AuthClient's
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

async function readUsageEvents(page: import("@playwright/test").Page) {
  return page.evaluate((key) => {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Array<{ name: string; userId: string; occurredAt: string }>) : [];
  }, USAGE_EVENTS_KEY);
}

test("E13-S010: starting a new conversation from the zero-interaction route persists a conversation_created usage event", async ({
  page,
}) => {
  await login(page);
  expect(await readUsageEvents(page)).toEqual([]);

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

  const events = await readUsageEvents(page);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ name: "conversation_created", userId: MOCK_VALID_USER_ID });
});

test("E13-S010: starting a new conversation from the file-first entry route persists a conversation_created usage event", async ({
  page,
}) => {
  await login(page);
  expect(await readUsageEvents(page)).toEqual([]);

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

  const events = await readUsageEvents(page);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ name: "conversation_created", userId: MOCK_VALID_USER_ID });
});
