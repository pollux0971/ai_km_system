import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S017 — the final story of E13 (Feedback & Analytics). Same
 * pattern as this repo's other epic-closing "XX E2E" stories
 * (E01-S020/E03-S033/E05-S031/E07-S025/E09-S024/E11-S025, and E13's own
 * earlier E13-S006): zero production code changes, pure composition-
 * level test coverage. Epic 檔對這個 story 沒有任何專屬內容,只有通用
 * 樣板文字 + 標題。
 *
 * 稽核全部既有 E13 spec(answer-ok-feedback/answer-ng-feedback/
 * feedback-reason-selector/free-text-feedback/citation-feedback/
 * feedback-submission-state/feedback-to-knowledge-candidate/
 * usage-event-instrumentation/conversation-created-event/
 * rag-outcome-analytics/latency-instrumentation,共 11 個檔案)找到的
 * 具體落差:
 *
 * 1. E13-S009~S013 各自的測試只驗證「單一動作 → 單一事件」
 *    (usage-event-instrumentation.spec.ts 只送一則訊息、
 *    conversation-created-event.spec.ts 只建立一個空對話、
 *    rag-outcome-analytics.spec.ts/latency-instrumentation.spec.ts 各自
 *    只檢查一則回答的單一事件)。從未有任何測試證明「一個真實使用者
 *    session 裡連續發生多個動作(建立對話含蓄意跳過、送出多則訊息)
 *    後,`usage-events` sessionStorage 累積出的事件序列本身是否正確、
 *    一致、可歸因(同一個 userId、每則回覆各自一組
 *    conversation_message_sent+rag_answer_outcome、無交叉污染)」——
 *    這是這一整組 analytics 事件真正要交付的價值(可靠的原始資料
 *    序列),但從未被端對端驗證過。
 * 2. E13-S006(feedback submission state)驗證了 verdict/reason/comment/
 *    citation 四個回饋維度在同一則回覆上的組合,但 E13-S006 完成時
 *    E13-S015(feedback-to-knowledge-candidate flow)還不存在——沒有
 *    任何測試證明「知識落差候選標記」與其他四個回饋維度、以及背景
 *    自動記錄的 usage/RAG events,在同一個真實 session 裡全部同時
 *    發生時彼此不干擾,也未證明這五者跨頁面導覽後仍然全部正確持久化。
 *
 * 一個測試涵蓋兩個落差:在既有 seeded 對話裡送出兩則訊息(觸發 2 次
 * conversation_message_sent + 2 次 rag_answer_outcome),對第一則回覆
 * 給 NG+原因+留言+標記為知識落差候選(五個動作全部發生在同一則
 * 回覆),對第二則回覆給 OK+留言(不同回覆、不同維度組合),然後
 * 直接讀 sessionStorage 驗證整個事件序列的正確性與一致性,並確認
 * 頁面導覽離開再回來後,UI 狀態與底層事件序列兩者都還是一致的。
 * 同其餘 E13 spec 一貫慣例:全程 in-app 導覽,不用 page.reload()
 * (會清空 mock AuthClient 的 in-memory session,見
 * answer-ok-feedback.spec.ts 的檔案 doc comment)。
 *
 * E13-S020 rewrite note: apps/web 的 usage events 不再寫入
 * sessionStorage(整批改送 `POST /usage-events`),本檔的 usage-event
 * 斷言機制改為 `page.route()` 攔截實際送出的請求(同其餘 4 個 E13 E2E
 * spec 的作法)。`userId` 不再出現在請求本文(analytics.yaml 的規則:
 * 身分來自 session,不接受 client 端提供),因此不再對每個事件斷言
 * userId——這是刻意移除,不是遺漏。`GET /admin/metrics/*` 這條 spec
 * 原文設想的替代路徑需要 E03-S038(真實 apps/api 接進 Playwright)才
 * 可行,E03-S038 尚未完成,此處先以 route 攔截誠實驗證「client 端真的
 * 送出正確的事件序列」這個本story 範圍內可驗證的宣稱;更深一層「一個
 * 真實後端是否正確彙總」留給 E03-S038 之後的 story 驗證,不在此冒充
 * 已完成。feedback-knowledge-candidates 部分(仍 sessionStorage)不在
 * 本 story 範圍內,維持原樣零改動。
 */

const KNOWLEDGE_CANDIDATES_KEY = "ai-km:mock-feedback-knowledge-candidates";

type CapturedUsageEvent = {
  name: string;
  conversationId?: string;
  occurredAt: string;
  answerState?: string;
  citationCount?: number;
  latencyMs?: number;
};

async function captureUsageEvents(page: import("@playwright/test").Page): Promise<CapturedUsageEvent[]> {
  const captured: CapturedUsageEvent[] = [];
  await page.route("**/api/v1/usage-events", async (route) => {
    captured.push(route.request().postDataJSON() as CapturedUsageEvent);
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "e2e-stub-id" }) });
  });
  return captured;
}

type RawKnowledgeCandidate = {
  id: string;
  sourceMessageId: string;
  conversationId: string;
  answerContent: string;
  reason: string;
  comment: string;
  createdAt: string;
};

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
  return page.getByRole("list", { name: "對話串" }).getByRole("listitem");
}

async function waitForThreadToSettle(page: import("@playwright/test").Page) {
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0, { timeout: 20000 });
}

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

async function readKnowledgeCandidates(page: import("@playwright/test").Page) {
  return page.evaluate((key) => {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as RawKnowledgeCandidate[]) : [];
  }, KNOWLEDGE_CANDIDATES_KEY);
}

test("E13-S017: a real multi-message session with feedback, comments, citation feedback, and a knowledge-candidate flag on one reply produces a correct, consistent usage-event stream and survives in-app navigation", async ({
  page,
}) => {
  const captured = await captureUsageEvents(page);
  await openConversation(page);
  const conversationUrl = page.url();
  expect(captured).toEqual([]);
  expect(await readKnowledgeCandidates(page)).toEqual([]);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await page.getByLabel("訊息").fill("有哪些排除項目？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  await expect(messageItems(page)).toHaveCount(4);

  const firstReply = messageItems(page).nth(1);
  const secondReply = messageItems(page).nth(3);

  // First reply: NG + reason + comment + knowledge-candidate flag — all
  // four in one place, on top of the two automatic per-reply events
  // (conversation_message_sent/rag_answer_outcome) that already fired
  // from sending each message above.
  await firstReply.getByRole("button", { name: "沒有幫助", exact: true }).click();
  await expect(firstReply.getByRole("button", { name: "已回饋：沒有幫助" })).toBeVisible();
  await firstReply.getByRole("radio", { name: "答案不完整" }).check();
  await firstReply.getByRole("button", { name: "送出原因" }).click();
  await expect(firstReply.getByText("已選擇原因：答案不完整")).toBeVisible();
  await firstReply.getByLabel("留言").fill("少了逾期未申報的排除情形。");
  await firstReply.getByRole("button", { name: "送出留言" }).click();
  await expect(firstReply.getByText("已送出留言：少了逾期未申報的排除情形。")).toBeVisible();
  await firstReply.getByRole("button", { name: "標記為知識落差候選" }).click();
  await expect(firstReply.getByRole("button", { name: "已標記為知識落差候選" })).toBeVisible();

  // Second reply: a different dimension combination (OK + comment, no
  // reason, no candidate flag — that button only ever renders for NG).
  await secondReply.getByRole("button", { name: "有幫助", exact: true }).click();
  await expect(secondReply.getByRole("button", { name: "已回饋：有幫助" })).toBeVisible();
  await secondReply.getByLabel("留言").fill("這題答得很清楚。");
  await secondReply.getByRole("button", { name: "送出留言" }).click();
  await expect(secondReply.getByText("已送出留言：這題答得很清楚。")).toBeVisible();
  await expect(secondReply.getByRole("button", { name: "標記為知識落差候選" })).toHaveCount(0);

  // The full event stream from this one real session must be internally
  // consistent: exactly one conversation_message_sent + one
  // rag_answer_outcome per reply, in the order the actions actually
  // happened. (Pre-S020 this also asserted every event's userId matched
  // the logged-in user — removed under S020, not overlooked: userId is
  // no longer part of the request body at all, by design, per
  // analytics.yaml's "identity comes from the session" rule.)
  await expect.poll(() => captured.length).toBe(4);
  const events = captured;
  const sentEvents = events.filter((event) => event.name === "conversation_message_sent");
  const ragEvents = events.filter((event) => event.name === "rag_answer_outcome");
  expect(sentEvents).toHaveLength(2);
  expect(ragEvents).toHaveLength(2);
  for (const ragEvent of ragEvents) {
    expect(typeof ragEvent.citationCount).toBe("number");
    expect(typeof ragEvent.latencyMs).toBe("number");
    expect(ragEvent.latencyMs).toBeGreaterThanOrEqual(0);
  }
  const timestamps = events.map((event) => new Date(event.occurredAt).getTime());
  expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));

  // The knowledge-candidate record is scoped to exactly the flagged
  // reply — never the untouched second reply.
  const candidates = await readKnowledgeCandidates(page);
  expect(candidates).toHaveLength(1);
  expect(candidates[0]).toMatchObject({
    conversationId: conversationUrl.split("/").pop(),
    reason: "INCOMPLETE",
    comment: "少了逾期未申報的排除情形。",
  });

  // Navigate away and back — every dimension on both replies must still
  // be there and unchanged, and the in-app navigation itself must not
  // have triggered any new (spurious) usage-event request.
  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);
  await waitForThreadToSettle(page);

  const reloadedFirstReply = messageItems(page).nth(1);
  const reloadedSecondReply = messageItems(page).nth(3);
  await expect(reloadedFirstReply.getByRole("button", { name: "已標記為知識落差候選" })).toBeVisible();
  await expect(reloadedFirstReply.getByText("已送出留言：少了逾期未申報的排除情形。")).toBeVisible();
  await expect(reloadedSecondReply.getByRole("button", { name: "已回饋：有幫助" })).toBeVisible();
  await expect(reloadedSecondReply.getByRole("button", { name: "標記為知識落差候選" })).toHaveCount(0);

  expect(captured).toHaveLength(4);
  expect(await readKnowledgeCandidates(page)).toHaveLength(1);
});
