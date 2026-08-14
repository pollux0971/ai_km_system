import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S033, the final story in this epic: unlike every prior E03 story
 * (each adding a NARROW spec proving its own single feature in
 * isolation, with exactly one assistant reply ever in play), this one
 * has no SOURCE_BASELINE.md section and no epic-file content beyond its
 * own title — same situation as S31/S32. The title itself, "conversation
 * E2E with mocked backend", names the actual deliverable directly: a
 * comprehensive end-to-end test proving a REALISTIC, multi-turn session
 * composes correctly, not just that each feature works alone.
 *
 * This matters because several of this epic's own scoping rules are
 * relative to "the thread so far" (S19's regenerate is last-entry-only;
 * S27's copy is Map-keyed per messageId specifically to survive
 * concurrent multi-message use) and NO existing spec — unit, component,
 * or E2E — ever puts a SECOND assistant reply into play to prove those
 * rules actually hold once the thread grows. regenerate-answer.spec.ts's
 * "only offered on the last message" test only ever checks the user's
 * own message never gets it, with a single reply total; it never checks
 * an EARLIER reply loses it once a later one exists. copy-answer.spec.ts
 * proves two messages both get copy buttons, but never clicks both in
 * the same session. This spec closes that gap directly, no new frontend
 * code needed — Team A's own scope note for this story (see epic file)
 * is explicit that this is a test-only story.
 *
 * Navigation after login always uses in-app link clicks, never
 * page.goto() — see conversations.spec.ts's file doc comment for why.
 */

const DISCONNECT_TRIGGER = "[模擬:STREAM_DISCONNECT]";

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

// Scoped to <main> — see streaming-response.spec.ts's file doc comment
// for why an unscoped page.getByRole("listitem") collides with the
// sidebar nav's own <ul>/<li> structure.
function messageItems(page: import("@playwright/test").Page) {
  return page.getByRole("main").getByRole("listitem");
}

async function waitForThreadToSettle(page: import("@playwright/test").Page) {
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0, { timeout: 20000 });
}

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

test("E03-S033: a realistic multi-turn session composes citation preview, per-message copy, regenerate's last-entry scope, and attachments correctly together, and it all survives a reload", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openConversation(page);

  // Turn 1: a plain question, settling with a citation.
  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  await expect(messageItems(page)).toHaveCount(2);

  const reply1 = messageItems(page).nth(1);
  // Citation buttons are labeled from the marker's own number
  // ([1]) per message, not a thread-wide running index — every
  // reply's own citation button reads "檢視引用來源 1" independently
  // (see message-content.tsx), so this MUST stay scoped to reply1's
  // own list item once a second reply exists later, or the unscoped
  // locator would match two identically-labeled buttons at once.
  await reply1.getByRole("button", { name: "檢視引用來源 1" }).click();
  const drawer = page.getByRole("region", { name: "引用來源預覽" });
  await expect(drawer).toBeVisible();
  await page.getByRole("button", { name: "關閉" }).click();
  await expect(drawer).not.toBeVisible();

  await expect(reply1.getByRole("button", { name: "重新產生" })).toHaveCount(1);

  // Turn 2: a second question, this time with an attachment — reply1
  // is no longer the last entry once this settles.
  await page.getByLabel("附件").setInputFiles({
    name: "常見問題.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("fake pdf content"),
  });
  await page.getByLabel("訊息").fill("還有其他常見問題嗎？");
  await page.getByRole("button", { name: "送出" }).click();
  await expect(page.getByText("檔案處理中…")).toBeVisible();
  await waitForThreadToSettle(page);
  await expect(messageItems(page)).toHaveCount(4);
  await expect(page.getByText("（附件：常見問題.pdf）")).toBeVisible();

  const reply2 = messageItems(page).nth(3);

  // E03-S19's last-entry restriction correctly narrows as the thread
  // grows: reply1 loses 重新產生 the moment it's no longer last, reply2
  // (the new last entry) gains it. No prior spec ever had two assistant
  // replies in play at once to prove this transition actually happens.
  await expect(reply1.getByRole("button", { name: "重新產生" })).toHaveCount(0);
  await expect(reply2.getByRole("button", { name: "重新產生" })).toHaveCount(1);

  // E03-S27's per-message copy state (Map-keyed by messageId — see
  // message-thread.tsx's own doc comment on the race an earlier,
  // single-shared-slot version had) proven here in a real multi-message
  // thread: copying two DIFFERENT messages' replies still lets both
  // show their own 已複製 at once, not just in the component test's
  // synthetic concurrent-mock setup.
  await reply1.getByRole("button", { name: "複製" }).click();
  await reply2.getByRole("button", { name: "複製" }).click();
  await expect(reply1.getByRole("button", { name: "已複製" })).toBeVisible();
  await expect(reply2.getByRole("button", { name: "已複製" })).toBeVisible();

  // Regenerating the new last entry only ever touches its own revision
  // history — reply1's stays untouched.
  await reply2.getByRole("button", { name: "重新產生" }).click();
  await waitForThreadToSettle(page);
  await expect(reply2.getByText("先前版本（1）")).toBeVisible();
  await expect(reply1.getByText("先前版本", { exact: false })).toHaveCount(0);

  // Everything above survives a real reload.
  const conversationUrl = page.url();
  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);

  await expect(messageItems(page)).toHaveCount(4);
  await expect(page.getByText("（附件：常見問題.pdf）")).toBeVisible();
  await expect(messageItems(page).nth(3).getByText("先前版本（1）")).toBeVisible();
  await expect(messageItems(page).nth(1).getByRole("button", { name: "檢視引用來源 1" })).toBeVisible();
});

test("E03-S033: a mid-thread stream disconnect on a later turn leaves an earlier settled reply's citation/copy untouched, and reload cleanly drops only the unsettled entry", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  const reply1 = messageItems(page).nth(1);
  await expect(reply1.getByRole("button", { name: "檢視引用來源 1" })).toBeVisible();

  await page.getByLabel("訊息").fill(`有哪些排除項目？ ${DISCONNECT_TRIGGER}`);
  await page.getByRole("button", { name: "送出" }).click();

  const alertBadge = page.getByRole("main").getByRole("alert");
  await expect(alertBadge).toBeVisible({ timeout: 20000 });
  await expect(alertBadge).toHaveText("連線中斷");

  // The earlier, already-settled reply is completely unaffected by a
  // LATER entry's disconnect — same citation button, and copying it
  // still works normally.
  await expect(reply1.getByRole("button", { name: "檢視引用來源 1" })).toBeVisible();
  await reply1.getByRole("button", { name: "複製" }).click();
  await expect(reply1.getByRole("button", { name: "已複製" })).toBeVisible();

  // The disconnected entry is purely transient (never persisted) — the
  // user's own second message WAS already persisted (sendMessage
  // succeeds before streaming even starts), so it survives reload, but
  // the never-settled assistant reply for it does not reappear as
  // anything (not a duplicate, not a stuck error state).
  const conversationUrl = page.url();
  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);

  await expect(messageItems(page)).toHaveCount(3);
  await expect(messageItems(page).nth(2)).toContainText("有哪些排除項目？");
  // Scoped to <main> — an unscoped role="alert" also matches
  // NotificationCenter's own unrelated error state in the header (see
  // notification-center.tsx), which has nothing to do with this test.
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});
