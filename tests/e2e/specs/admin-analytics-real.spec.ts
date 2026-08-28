import { test, expect, type Page } from "@playwright/test";

/**
 * E13-S021 AC5 — the cross-app closer this story's own Scope In names:
 * in one continuous flow, send a message and give NG+reason+comment+
 * citation feedback on :3000 (apps/web, real backend per E03-S038), then
 * verify all 4 admin analytics surfaces (:3001) show that same real data
 * — the feedback queue, its detail page, usage, latency, and health.
 *
 * Every accessible-name string and technical claim below (message-thread
 * button/label text, `MOCK_REPLY`'s trailing `[1]`, `recordUsageEvent`'s
 * real `POST /usage-events` call, the seeded conversation title) has been
 * independently re-verified against the current source by W3, line by
 * line — not accepted on a research assistant's say-so.
 *
 * Runs under the `admin` project (this file's `admin-` prefix) so
 * Playwright pre-authenticates its storageState for :3001 — irrelevant
 * here since this test does its own fresh login on :3000 first (see
 * `loginOnWeb` below: relative `page.goto("/login")` inside a shared
 * helper always resolves against a FIXED project `baseURL`, which for
 * this project is :3001 — an absolute URL is the only way to reach
 * :3000's login page from here, so this file cannot reuse
 * `helpers/auth.ts`'s `loginAs`, hence the small local duplicate below,
 * same "each spec keeps its own inline login()" precedent
 * `helpers/auth.ts`'s own doc comment already establishes). The
 * resulting session cookie is host-only for "localhost" (no `Domain`
 * configured — `services/identity`'s `setSessionCookie`), and cookies
 * are NOT port-scoped per RFC 6265, so this same context is already
 * authenticated for :3001 once logged in on :3000 — no second login
 * needed.
 *
 * `demo-super` (super_administrator) — named in the spec's own AC5
 * wording ("同時具一般使用者能力") specifically because this one account
 * needs to both use the product AS a normal user (send a message, give
 * feedback) AND read the admin analytics surfaces afterward, which a
 * narrower seeded role could not do for the second half.
 *
 * The assistant reply comes from `apps/web/src/lib/streaming.ts`'s
 * MOCK_REPLY, which always ends in a `[1]` citation marker — no
 * `[模擬:...]` trigger needed for the default ANSWERED state
 * (`answer-state.ts`'s own doc comment). Sending it also fires the real
 * `conversation_message_sent` and `rag_answer_outcome` usage events
 * (`message-thread.tsx`), which is what makes `questionsAsked` and the
 * latency sample count real below — not fabricated for this test.
 */

const WEB_ORIGIN = "http://localhost:3000";
const ADMIN_ORIGIN = "http://localhost:3001";
const SEEDED_CONVERSATION_TITLE = "產品保固政策詢問";
const FEEDBACK_COMMENT = `E13-S021 real-API E2E ${Date.now()}`;

async function loginOnWeb(page: Page): Promise<void> {
  await page.goto(`${WEB_ORIGIN}/login`);
  await page.getByLabel("帳號").fill("demo-super");
  await page.getByLabel("密碼").fill("demo-pass-123");
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

function sidebarNav(page: Page) {
  return page.getByRole("navigation", { name: "主導覽" });
}

function messageItems(page: Page) {
  return page.getByRole("list", { name: "對話串" }).getByRole("listitem");
}

async function waitForThreadToSettle(page: Page): Promise<void> {
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0, { timeout: 20000 });
}

test("E13-S021 AC5: a real NG+reason+comment+citation feedback submitted on web appears, with real data, across every admin analytics surface", async ({
  page,
}) => {
  test.slow();

  // --- web (:3000): send a message, get a reply with a [1] citation, give full feedback ---
  await loginOnWeb(page);

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  // The sandbox seed (E04-S041/E04-S053) gives every fresh sandbox login
  // this conversation, already empty — same seed the old mock-era specs
  // coincidentally shared a title with, now reached via a real login.
  await page.getByRole("main").getByRole("link", { name: SEEDED_CONVERSATION_TITLE }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const reply = messageItems(page).nth(1);
  await expect(reply).toContainText("[1]");

  await reply.getByRole("button", { name: "沒有幫助", exact: true }).click();
  await expect(reply.getByRole("button", { name: "已回饋：沒有幫助" })).toBeVisible();

  await reply.getByRole("radio", { name: "答案不完整" }).check();
  await reply.getByRole("button", { name: "送出原因" }).click();
  await expect(reply.getByText("已選擇原因：答案不完整")).toBeVisible();

  await reply.getByLabel("留言").fill(FEEDBACK_COMMENT);
  await reply.getByRole("button", { name: "送出留言" }).click();
  await expect(reply.getByText(`已送出留言：${FEEDBACK_COMMENT}`)).toBeVisible();

  await reply.getByRole("button", { name: "檢視引用來源 1" }).click();
  const previewDrawer = page.getByRole("region", { name: "引用來源預覽" });
  await expect(previewDrawer).toBeVisible();
  await previewDrawer.getByRole("button", { name: "此引用有幫助" }).click();
  await expect(previewDrawer.getByRole("button", { name: "已回饋：此引用有幫助" })).toBeVisible();
  await previewDrawer.getByRole("button", { name: "關閉" }).click();

  // --- admin (:3001): same browser context, same session cookie (host-only, not port-scoped) ---

  await page.goto(`${ADMIN_ORIGIN}/feedback`);
  await expect(page.getByRole("heading", { name: "回饋佇列", level: 1, exact: true })).toBeVisible();
  // The list row only shows verdict/reason/excerpt, not the free-text
  // comment (feedback-list.tsx) — the row is reached via its own "NG"
  // link, then the comment/citation-feedback assertions happen on the
  // detail page below.
  await page.getByRole("main").getByRole("link", { name: "NG" }).first().click();
  await page.waitForURL((url) => /^\/feedback\/.+/.test(url.pathname));
  await expect(page.getByText(FEEDBACK_COMMENT, { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "引用回饋" })).toBeVisible();
  await expect(page.getByText("引用 1")).toBeVisible();

  const today = new Date().toISOString().slice(0, 10);
  await page.goto(`${ADMIN_ORIGIN}/usage`);
  await expect(page.getByLabel("查詢日期（UTC）")).toHaveValue(today);
  const questionsBlock = page.getByText("今日提問數", { exact: true }).locator("..");
  await expect(questionsBlock.locator("p").last()).not.toHaveText("0");

  await page.goto(`${ADMIN_ORIGIN}/latency`);
  const sampleCountBlock = page.getByText("樣本數", { exact: true }).locator("..");
  await expect(sampleCountBlock.locator("p").last()).not.toHaveText("0");

  await page.goto(`${ADMIN_ORIGIN}/health`);
  await expect(page.getByText("狀態未知", { exact: true })).toHaveCount(0);
});
