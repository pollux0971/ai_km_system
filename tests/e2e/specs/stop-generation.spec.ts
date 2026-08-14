import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S012 critical flow: stopping an in-progress assistant reply.
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

// Scoped to <main> — see streaming-response.spec.ts's file doc comment
// for why an unscoped page.getByRole("listitem") collides with the
// sidebar nav's own <ul>/<li> structure.
function messageItems(page: import("@playwright/test").Page) {
  return page.getByRole("main").getByRole("listitem");
}

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

test("E03-S012: stopping during the phase sequence removes the entry entirely, leaving only the user's own message", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();

  await expect(page.getByText("搜尋中…")).toBeVisible();
  await page.getByRole("button", { name: "停止生成" }).click();

  await expect(page.getByRole("button", { name: "停止生成" })).not.toBeVisible();
  await expect(messageItems(page)).toHaveCount(1);
});

test("E03-S012: stopping after some reply text has streamed in keeps that partial text as the settled message", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();

  // Let some real text accumulate before stopping. The phase sequence
  // alone takes ~1.8s (3 phases × 600ms) — waiting for "AI 回覆中…"
  // (the fallback shown only once real text has started arriving,
  // replacing the phase label) is what actually confirms we're past
  // it, not just waiting for the stop button to exist (which appears
  // immediately, well before any phase or real text shows).
  //
  // Click as soon as that text appears — no extra fixed sleep. message-
  // thread.tsx sets `phase: null` (which is what makes "AI 回覆中…"
  // render) in the SAME state update as the first streamed chunk's
  // content snapshot, so that visibility already guarantees at least
  // one real character has accumulated; a trailing waitForTimeout(100)
  // bought nothing but exposure to still-ongoing streaming re-renders.
  // Discovered as a genuine (pre-existing, unrelated to E03-S013) flake
  // under heavy concurrent load (`pnpm test` running vitest across
  // every package alongside this Playwright/Chromium session): the
  // fixed 100ms sleep could lose its race against the mock reply
  // finishing and reconciling to "sent" (removing the button entirely)
  // while a slowed-down click was still retrying, surfacing as
  // Playwright's "element was detached from the DOM" after 30s.
  // Reproduced deterministically via `git stash` back to pre-S013 code
  // plus `pnpm turbo run test --force`, confirming this file — not
  // S013's changes — was the root cause.
  //
  // E03-S019: the same flake resurfaced under heavier concurrent load
  // (more E2E spec files have accumulated in this suite since S013),
  // even with the fix above already in place — confirmed via `git diff`
  // (this file untouched by S019) and running this spec in isolation
  // (passes cleanly alone), so it's still not caused by whichever
  // story happens to be running when it's hit. The deeper mechanism:
  // every streamed character re-renders this <li>, including the
  // sibling <span> holding the growing reply text — under enough CPU
  // contention, that can shift the stop button's on-screen bounding
  // box between the animation frames Playwright's actionability check
  // compares for a mouse click, so it never observes two stable frames
  // in a row and keeps retrying (visible in the error log: repeated
  // "element is not stable") until either it finally lands or the
  // stream finishes and reconciles to "sent" first, removing the
  // button out from under a still-in-flight retry ("element was
  // detached from the DOM"). `force: true` is applied deliberately,
  // not as a blanket escape hatch: the button's existence and
  // enabled/visible state are already independently confirmed by the
  // `getByText("AI 回覆中…")` wait immediately above (phase clears to
  // null in the exact same state update that renders the button), so
  // skipping only the stability-across-frames check here bypasses
  // exactly the part of actionability this specific, diagnosed
  // mechanism makes unreliable — not a way to click something that
  // might not really be there.
  await expect(page.getByText("AI 回覆中…")).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "停止生成" }).click({ force: true });

  await expect(page.getByRole("button", { name: "停止生成" })).not.toBeVisible();
  const items = messageItems(page);
  // Item count staying at 2 (not reverting to 1) already proves some
  // real content had arrived before the stop was processed — an
  // entirely-empty stop removes the entry outright (see the other
  // test). The text-length check below additionally confirms it's
  // genuine reply content, not just the "AI" role-label span (which
  // alone would already make textContent non-empty).
  await expect(items).toHaveCount(2);
  const stoppedText = await items.nth(1).textContent();
  expect((stoppedText ?? "").length).toBeGreaterThan("AI".length);
});
