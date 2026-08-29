import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S009 critical flow: sending a message with optimistic state.
 * Navigation after login always uses in-app link clicks, never
 * page.goto() — see conversations.spec.ts's file doc comment for why.
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

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

test("E03-S009: sending a message shows it in the thread and clears the composer", async ({ page }) => {
  await openConversation(page);

  await expect(page.getByText("尚無訊息，開始對話吧。")).toBeVisible();

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();

  await expect(page.getByText("保固期限是多久？")).toBeVisible();
  await expect(page.getByLabel("訊息")).toHaveValue("");
});

test("E03-S009: a sent message persists across leaving and returning to the conversation", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("這則訊息應該要留著");
  await page.getByRole("button", { name: "送出" }).click();
  await expect(page.getByText("這則訊息應該要留著")).toBeVisible();
  const conversationUrl = page.url();

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);

  await expect(page.getByText("這則訊息應該要留著")).toBeVisible();
});

test("E03-S009: sending a message updates the conversation list's preview", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("這則會成為新的預覽文字");
  await page.getByRole("button", { name: "送出" }).click();
  // E03-S047: scoped to the message thread itself (`<ul aria-label="對話
  // 串">`, message-thread.tsx) — this assertion is about the message
  // landing in the thread, not about the sidebar's "歷史對話" nav, which
  // persists across every (app) page and starts showing the same text in
  // its own preview line the moment the parent conversation's
  // lastMessagePreview updates (sidebar.tsx:119). An unscoped getByText
  // here raced the sidebar exactly like the unscoped one below did.
  await expect(page.getByRole("list", { name: "對話串" }).getByText("這則會成為新的預覽文字")).toBeVisible();

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  // E03-S047: scoped to <main> — same disambiguation openConversation()
  // above already relies on (line 26) to tell the page's own conversation
  // list apart from the sidebar's "歷史對話" nav, which is outside <main>
  // and, on this exact page, shows this exact conversation's preview too.
  // This is the assertion the test is actually named for: the *list's*
  // preview (conversation-list.tsx's own `<span>{item.lastMessagePreview}</span>`),
  // not the sidebar's. Unscoped, this used to be a race — it passed only
  // when the sidebar's own preview hadn't updated yet (1 match instead of
  // 2), which is backwards from what the test claims to verify; see
  // docs/stories/E03-S047.md.
  await expect(page.getByRole("main").getByText("這則會成為新的預覽文字")).toBeVisible();
});

test("E03-S009: an attachment-only message (no text) can be sent", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("附件").setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from("fake png content"),
  });
  await page.getByRole("button", { name: "送出" }).click();

  await expect(page.getByText(/附件：photo\.png/)).toBeVisible();
});
