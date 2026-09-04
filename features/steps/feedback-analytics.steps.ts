/**
 * 09-feedback-analytics phase-1 步驟(回填)。
 *
 * 綁定的入口與既有 vitest 測試同一個:`apps/api` 的真實 `buildServer()`
 * (由 common.steps.ts 的「a fresh server with fake providers」啟動)+ 真實
 * `POST /v1/auth/login` 取得的 session cookie,打真實的
 * `/v1/usage-events`、`/v1/admin/metrics/*`、`/v1/admin/feedback`、
 * `/v1/conversations/.../feedback[/reason]`。這正是
 * `apps/api/src/feedback-service-wiring.test.ts`(真登入 → 真 route)與
 * `services/feedback/src/routes/*.test.ts`、
 * `services/conversation/src/routes/message-feedback.test.ts` 走的路徑,
 * 只是這裡一次走完整條組裝好的 server,沒有任何接縫被 mock 掉。
 *
 * 唯一的純函式綁定是 `packages/api-client/src/feedback-reason.ts` 的
 * `getFeedbackReasonLabel()`(`feedback-reason.test.ts` 用的同一個)。
 *
 * 未授權的場景刻意把「回傳內容有沒有洩漏」排在狀態碼之前(GHERKIN_WORKFLOW
 * §5.2:同一場景多條斷言時,第一條炸的決定紅的意義)。
 */
import { Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type { KmWorld } from "./_world.js";

import { getFeedbackReasonLabel } from "../../packages/api-client/src/feedback-reason.js";

/** 每個示範角色對應的真實帳號(services/identity 的 DEMO_ACCOUNTS,密碼是公開的示範值)。 */
const ACCOUNTS = {
  maintenance: "demo-maintenance",
  sales: "demo-sales",
  auditor: "demo-auditor",
  general: "demo-user",
} as const;
type Person = keyof typeof ACCOUNTS;

const DEMO_PASSWORD = "demo-pass-123";
/** apps/api 的 CSRF 守門要求所有變更請求帶這個標頭。 */
const CSRF_HEADER = { "x-requested-with": "XMLHttpRequest" };
/** 一則刻意超過摘要上限(200)的答案。 */
const LONG_ANSWER = "機密內容".repeat(100);

/** better-sqlite3 的最小結構型別——只讀,不引入該套件的型別依賴。 */
interface ReadOnlyDb {
  prepare(sql: string): { all(): unknown[] };
}

interface Session {
  readonly cookie: string;
  readonly userId: string;
}

interface RatedAnswer {
  readonly conversationId: string;
  readonly messageId: string;
  readonly content: string;
}

interface FeedbackState {
  readonly sessions: Map<Person, Session>;
  /** person → 這個 scenario 裡屬於他的那則答案 */
  readonly answers: Map<Person, RatedAnswer>;
  /** 這個 scenario seed 進去、未授權者絕對不該看到的字串 */
  readonly secrets: string[];
  labelledReasons?: string[];
}

function state(world: KmWorld): FeedbackState {
  let existing = world.bag["feedbackAnalytics"] as FeedbackState | undefined;
  if (!existing) {
    existing = { sessions: new Map(), answers: new Map(), secrets: [] };
    world.bag["feedbackAnalytics"] = existing;
  }
  return existing;
}

function response(world: KmWorld): LightMyRequestResponse {
  assert.ok(world.lastResponse, "還沒有送出任何請求(When 要打一次 API)");
  return world.lastResponse;
}

function db(app: FastifyInstance): ReadOnlyDb {
  return (app as unknown as { db: ReadOnlyDb }).db;
}

async function signIn(world: KmWorld, person: Person): Promise<Session> {
  const cached = state(world).sessions.get(person);
  if (cached) return cached;
  const app = await world.startServer();
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { ...CSRF_HEADER },
    payload: { username: ACCOUNTS[person], password: DEMO_PASSWORD },
  });
  assert.equal(res.statusCode, 200, `${ACCOUNTS[person]} 登入失敗:${res.statusCode} ${res.body}`);
  const raw = res.headers["set-cookie"];
  const header = Array.isArray(raw) ? raw[0] : raw;
  const match = /ai_km_session=[^;]+/.exec(header ?? "");
  assert.ok(match, `登入回應沒有 ai_km_session cookie:${JSON.stringify(raw)}`);
  const session: Session = { cookie: match[0], userId: (res.json() as { userId: string }).userId };
  state(world).sessions.set(person, session);
  return session;
}

async function postUsageEvent(
  world: KmWorld,
  person: Person,
  payload: Record<string, unknown>,
): Promise<LightMyRequestResponse> {
  const app = await world.startServer();
  const { cookie } = await signIn(world, person);
  return app.inject({ method: "POST", url: "/v1/usage-events", headers: { cookie, ...CSRF_HEADER }, payload });
}

async function adminGet(world: KmWorld, person: Person, url: string): Promise<void> {
  const app = await world.startServer();
  const { cookie } = await signIn(world, person);
  world.lastResponse = await app.inject({ method: "GET", url, headers: { cookie } });
}

/** 建一則屬於 `person` 的 AI 回答(真實對話 + 真實訊息路由),回傳它的 id。 */
async function createAnswer(world: KmWorld, person: Person, content: string): Promise<RatedAnswer> {
  const app = await world.startServer();
  const { cookie } = await signIn(world, person);
  const conversation = await app.inject({
    method: "POST",
    url: "/v1/conversations",
    headers: { cookie, ...CSRF_HEADER },
  });
  assert.equal(conversation.statusCode, 201, `建立對話失敗:${conversation.statusCode} ${conversation.body}`);
  const conversationId = (conversation.json() as { id: string }).id;
  const message = await app.inject({
    method: "POST",
    url: `/v1/conversations/${conversationId}/messages`,
    headers: { cookie, ...CSRF_HEADER },
    payload: { role: "assistant", content },
  });
  assert.equal(message.statusCode, 201, `建立 AI 回答失敗:${message.statusCode} ${message.body}`);
  const answer: RatedAnswer = { conversationId, messageId: (message.json() as { id: string }).id, content };
  const current = state(world);
  current.answers.set(person, answer);
  current.secrets.push(answer.messageId, content.slice(0, 200));
  return answer;
}

async function rateAnswer(
  world: KmWorld,
  person: Person,
  answer: RatedAnswer,
  verdict: string,
  reason?: string,
): Promise<LightMyRequestResponse> {
  const app = await world.startServer();
  const { cookie } = await signIn(world, person);
  const base = `/v1/conversations/${answer.conversationId}/messages/${answer.messageId}/feedback`;
  let last = await app.inject({ method: "PUT", url: base, headers: { cookie, ...CSRF_HEADER }, payload: { verdict } });
  if (reason !== undefined) {
    last = await app.inject({
      method: "PUT",
      url: `${base}/reason`,
      headers: { cookie, ...CSRF_HEADER },
      payload: { reason },
    });
  }
  return last;
}

function answerOf(world: KmWorld, person: Person): RatedAnswer {
  const answer = state(world).answers.get(person);
  assert.ok(answer, `這個 scenario 沒有為 ${ACCOUNTS[person]} 建立任何回答`);
  return answer;
}

// ---------------------------------------------------------------- Given

Given(
  "the maintenance engineer asked 2 questions and the salesperson asked 1 question on {string}",
  { timeout: 60_000 },
  async function (this: KmWorld, day: string) {
    for (const [person, count] of [
      ["maintenance", 2],
      ["sales", 1],
    ] as const) {
      for (let i = 0; i < count; i += 1) {
        const res = await postUsageEvent(this, person, {
          name: "conversation_message_sent",
          occurredAt: `${day}T0${i + 1}:00:00.000Z`,
        });
        assert.equal(res.statusCode, 201, `記錄提問事件失敗:${res.statusCode} ${res.body}`);
      }
    }
  },
);

Given(
  "the maintenance engineer's answers today took 100, 200 and 300 milliseconds",
  { timeout: 60_000 },
  async function (this: KmWorld) {
    const now = new Date().toISOString();
    for (const latencyMs of [100, 200, 300]) {
      const res = await postUsageEvent(this, "maintenance", { name: "rag_answer_outcome", latencyMs, occurredAt: now });
      assert.equal(res.statusCode, 201, `記錄回答事件失敗:${res.statusCode} ${res.body}`);
    }
  },
);

Given(
  "the maintenance engineer's only answer took {int} milliseconds {int} days ago",
  { timeout: 60_000 },
  async function (this: KmWorld, latencyMs: number, days: number) {
    const occurredAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const res = await postUsageEvent(this, "maintenance", { name: "rag_answer_outcome", latencyMs, occurredAt });
    assert.equal(res.statusCode, 201, `記錄回答事件失敗:${res.statusCode} ${res.body}`);
  },
);

Given(
  "the maintenance engineer rated an answer NG with reason {string} and the salesperson rated another answer OK",
  { timeout: 60_000 },
  async function (this: KmWorld, reason: string) {
    const ng = await createAnswer(this, "maintenance", "維修部的答案:保固期為一年。");
    const ngRes = await rateAnswer(this, "maintenance", ng, "NG", reason);
    assert.equal(ngRes.statusCode, 200, `給 NG + 原因失敗:${ngRes.statusCode} ${ngRes.body}`);
    const ok = await createAnswer(this, "sales", "業務部的答案:潤滑油每三個月更換一次。");
    const okRes = await rateAnswer(this, "sales", ok, "OK");
    assert.equal(okRes.statusCode, 200, `給 OK 失敗:${okRes.statusCode} ${okRes.body}`);
  },
);

Given(
  "the maintenance engineer rated an answer far longer than an excerpt as OK",
  { timeout: 60_000 },
  async function (this: KmWorld) {
    const answer = await createAnswer(this, "maintenance", LONG_ANSWER);
    const res = await rateAnswer(this, "maintenance", answer, "OK");
    assert.equal(res.statusCode, 200, `給 OK 失敗:${res.statusCode} ${res.body}`);
  },
);

Given("the maintenance engineer has one AI answer nobody has rated yet", { timeout: 60_000 }, async function (this: KmWorld) {
  await createAnswer(this, "maintenance", "維修部的答案:保固期為一年。[1]");
});

// ---------------------------------------------------------------- When

When(
  "the maintenance engineer records a {string} usage event at {string}",
  { timeout: 60_000 },
  async function (this: KmWorld, name: string, occurredAt: string) {
    this.lastResponse = await postUsageEvent(this, "maintenance", { name, occurredAt });
  },
);

When(
  "the maintenance engineer records a usage event that names {string} as the user",
  { timeout: 60_000 },
  async function (this: KmWorld, claimed: string) {
    this.lastResponse = await postUsageEvent(this, "maintenance", {
      name: "conversation_created",
      occurredAt: "2026-08-28T05:00:00.000Z",
      userId: claimed,
    });
  },
);

When("the auditor reads the usage dashboard for {string}", { timeout: 60_000 }, async function (this: KmWorld, day: string) {
  await adminGet(this, "auditor", `/v1/admin/metrics/usage?date=${day}`);
});

When("a general user reads the usage dashboard for {string}", { timeout: 60_000 }, async function (this: KmWorld, day: string) {
  await adminGet(this, "general", `/v1/admin/metrics/usage?date=${day}`);
});

When("the auditor reads the latency dashboard over the default window", { timeout: 60_000 }, async function (this: KmWorld) {
  await adminGet(this, "auditor", "/v1/admin/metrics/latency");
});

When("the auditor reads the latency dashboard over {int} days", { timeout: 60_000 }, async function (this: KmWorld, days: number) {
  await adminGet(this, "auditor", `/v1/admin/metrics/latency?days=${days}`);
});

When("the auditor opens the feedback queue", { timeout: 60_000 }, async function (this: KmWorld) {
  await adminGet(this, "auditor", "/v1/admin/feedback");
});

When("a general user opens the feedback queue", { timeout: 60_000 }, async function (this: KmWorld) {
  await adminGet(this, "general", "/v1/admin/feedback");
});

When("the admin console labels the feedback reason codes {string} and {string}", function (this: KmWorld, known: string, unknown: string) {
  state(this).labelledReasons = [getFeedbackReasonLabel(known), getFeedbackReasonLabel(unknown)];
});

When(
  "the maintenance engineer rates that answer {string} and gives the reason {string}",
  { timeout: 60_000 },
  async function (this: KmWorld, verdict: string, reason: string) {
    this.lastResponse = await rateAnswer(this, "maintenance", answerOf(this, "maintenance"), verdict, reason);
  },
);

When(
  "the maintenance engineer gives the reason {string} on that unrated answer",
  { timeout: 60_000 },
  async function (this: KmWorld, reason: string) {
    const app = await this.startServer();
    const { cookie } = await signIn(this, "maintenance");
    const answer = answerOf(this, "maintenance");
    this.lastResponse = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${answer.conversationId}/messages/${answer.messageId}/feedback/reason`,
      headers: { cookie, ...CSRF_HEADER },
      payload: { reason },
    });
  },
);

// ---------------------------------------------------------------- Then

Then("the recorded usage event belongs to the maintenance engineer", async function (this: KmWorld) {
  const app = await this.startServer();
  const expected = (await signIn(this, "maintenance")).userId;
  const id = (response(this).json() as { id: string }).id;
  const rows = db(app).prepare("SELECT id, owner_key, user_id FROM usage_events").all() as {
    id: string;
    owner_key: string;
    user_id: string;
  }[];
  const row = rows.find((candidate) => candidate.id === id);
  assert.ok(row, `usage_events 裡找不到 id 為 ${id} 的事件,現有:${JSON.stringify(rows)}`);
  assert.deepEqual(
    { ownerKey: row.owner_key, userId: row.user_id },
    { ownerKey: expected, userId: expected },
    `事件的身分必須完全來自 session(${expected}),實際 owner_key=${row.owner_key} user_id=${row.user_id}`,
  );
});

Then("the usage log holds no event at all", async function (this: KmWorld) {
  const app = await this.startServer();
  const rows = db(app).prepare("SELECT id, user_id FROM usage_events").all();
  assert.deepEqual(rows, [], `被拒絕的請求不得留下任何事件,實際留下:${JSON.stringify(rows)}`);
});

Then("the usage dashboard reports {int} daily active users and {int} questions asked", function (this: KmWorld, dau: number, questions: number) {
  const body = response(this).json() as { dailyActiveUsers: number; questionsAsked: number };
  assert.deepEqual(
    { dailyActiveUsers: body.dailyActiveUsers, questionsAsked: body.questionsAsked },
    { dailyActiveUsers: dau, questionsAsked: questions },
    `使用量應為 DAU=${dau}、提問數=${questions},實際 DAU=${body.dailyActiveUsers}、提問數=${body.questionsAsked}`,
  );
});

Then(
  "the latency dashboard reports an average of {int} milliseconds over {int} answer(s)",
  function (this: KmWorld, average: number, samples: number) {
    const body = response(this).json() as { averageLatencyMs: number | null; sampleCount: number };
    assert.deepEqual(
      { averageLatencyMs: body.averageLatencyMs, sampleCount: body.sampleCount },
      { averageLatencyMs: average, sampleCount: samples },
      `延遲應為平均 ${average}ms／${samples} 筆,實際平均 ${body.averageLatencyMs}ms／${body.sampleCount} 筆`,
    );
  },
);

Then("the latency dashboard reports no average at all over {int} answer(s)", function (this: KmWorld, samples: number) {
  const body = response(this).json() as { averageLatencyMs: number | null; sampleCount: number };
  assert.deepEqual(
    { averageLatencyMs: body.averageLatencyMs, sampleCount: body.sampleCount },
    { averageLatencyMs: null, sampleCount: samples },
    `沒有樣本時平均值必須是 null(不是 0),實際 ${JSON.stringify(body.averageLatencyMs)}／${body.sampleCount} 筆`,
  );
});

Then("the reply carries none of the usage numbers", function (this: KmWorld) {
  const body = response(this).body;
  const leaked = ["dailyActiveUsers", "questionsAsked"].filter((field) => body.includes(field));
  assert.deepEqual(leaked, [], `未授權的呼叫者拿到了別人的使用量數字:${leaked.join("、")};回應本文=${body}`);
});

Then("the reply carries none of the rated answers", function (this: KmWorld) {
  const body = response(this).body;
  const leaked = state(this).secrets.filter((secret) => body.includes(secret));
  assert.deepEqual(
    leaked,
    [],
    `未授權的呼叫者拿到了別人的回饋內容:${leaked.map((s) => s.slice(0, 40)).join("、")};回應本文=${body.slice(0, 400)}`,
  );
});

Then("the feedback queue holds the maintenance engineer's answer and the salesperson's answer", function (this: KmWorld) {
  const body = response(this).json() as { items: { messageId: string; verdict: string }[]; totalCount: number };
  const listed = body.items.map((item) => `${item.messageId}:${item.verdict}`).sort();
  const expected = [
    `${answerOf(this, "maintenance").messageId}:ng`,
    `${answerOf(this, "sales").messageId}:ok`,
  ].sort();
  assert.deepEqual(listed, expected, `佇列必須橫跨兩個擁有者,實際列出 ${JSON.stringify(listed)}`);
  assert.equal(body.totalCount, 2, `totalCount 應為 2,實際 ${body.totalCount}`);
});

Then("the maintenance engineer's queued answer carries the reason {string}", function (this: KmWorld, reason: string) {
  const messageId = answerOf(this, "maintenance").messageId;
  const body = response(this).json() as { items: { messageId: string; reason?: string }[] };
  const item = body.items.find((candidate) => candidate.messageId === messageId);
  assert.ok(item, `佇列裡找不到維修工程師的那則答案(${messageId})`);
  assert.equal(item.reason, reason, `原因代碼應為 ${reason},實際 ${JSON.stringify(item.reason)}`);
});

Then("no queued answer carries the whole original answer", function (this: KmWorld) {
  const body = response(this).body;
  const whole = [...state(this).answers.values()].map((answer) => answer.content).filter((content) => content.length > 200);
  assert.ok(whole.length > 0, "這個場景沒有任何長到會被截斷的答案,斷言會落空");
  const leaked = whole.filter((content) => body.includes(content));
  assert.deepEqual(leaked, [], `佇列帶出了完整答案(${leaked.map((c) => c.length).join("、")} 字),它只該帶摘要`);
});

Then("every queued excerpt is at most {int} characters", function (this: KmWorld, max: number) {
  const body = response(this).json() as { items: { answerExcerpt: string }[] };
  const tooLong = body.items.map((item) => item.answerExcerpt.length).filter((length) => length > max);
  assert.deepEqual(tooLong, [], `摘要長度上限是 ${max},實際有 ${tooLong.join("、")}`);
});

Then("the labelled reasons read {string} and {string}", function (this: KmWorld, known: string, unknown: string) {
  const labelled = state(this).labelledReasons;
  assert.ok(labelled, "還沒有把任何原因代碼轉成標籤");
  assert.deepEqual(labelled, [known, unknown], `標籤應為 ${JSON.stringify([known, unknown])},實際 ${JSON.stringify(labelled)}`);
});

Then("that answer is stored with verdict {string} and reason {string}", async function (this: KmWorld, verdict: string, reason: string) {
  const app = await this.startServer();
  const { cookie } = await signIn(this, "maintenance");
  const answer = answerOf(this, "maintenance");
  const listed = await app.inject({
    method: "GET",
    url: `/v1/conversations/${answer.conversationId}/messages`,
    headers: { cookie },
  });
  const stored = (listed.json() as { id: string; feedback?: string; feedbackReason?: string }[]).find(
    (message) => message.id === answer.messageId,
  );
  assert.ok(stored, "讀不回那則答案");
  assert.deepEqual(
    { verdict: stored.feedback ?? null, reason: stored.feedbackReason ?? null },
    { verdict, reason },
    `應存成 ${verdict}／${reason},實際 ${JSON.stringify(stored.feedback ?? null)}／${JSON.stringify(stored.feedbackReason ?? null)}`,
  );
});

Then("that answer still carries no verdict and no reason", async function (this: KmWorld) {
  const app = await this.startServer();
  const { cookie } = await signIn(this, "maintenance");
  const answer = answerOf(this, "maintenance");
  const listed = await app.inject({
    method: "GET",
    url: `/v1/conversations/${answer.conversationId}/messages`,
    headers: { cookie },
  });
  const stored = (listed.json() as { id: string; feedback?: string; feedbackReason?: string }[]).find(
    (message) => message.id === answer.messageId,
  );
  assert.ok(stored, "讀不回那則答案");
  assert.deepEqual(
    { verdict: stored.feedback ?? null, reason: stored.feedbackReason ?? null },
    { verdict: null, reason: null },
    `原因不得脫離「沒有幫助」單獨存在,實際存成 ${JSON.stringify(stored.feedback ?? null)}／${JSON.stringify(stored.feedbackReason ?? null)}`,
  );
});
