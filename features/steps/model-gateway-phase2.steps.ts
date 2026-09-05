/**
 * 04-model-gateway phase-2 步驟。
 *
 * 這裡刻意不牽扯 06/07 是否透過這兩條路由取得 embedding/answer(DECISIONS_NEEDED
 * #38 已裁決 FEATURE.md 那句舊描述本身站不住腳——06/07 各自另外建了一份 in-process
 * gateway,從沒打過這兩條路由)。這三個場景只驗兩條路由本身,走的是真的
 * `apps/api` composition root(`_world.ts` 的 `startServer()` → 真的
 * `buildServer()`)+ 真的 `/v1/auth/login`,不是 `services/model-gateway` 自己
 * phase-1 用的 bare-harness(`buildGatewayTestApp`/`TEST_USER_HEADER`)。
 *
 * `enableTestAuthProvider: false` 貫穿全部場景——與
 * `apps/api/src/full-chain-session.test.ts` 的 AC1 同一種要求:關掉 `x-test-user`
 * 後門,才能證明「對真 session」不是巧合地被那個後門墊著過關。
 */
import { Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import type { FastifyInstance } from "fastify";
import type { KmWorld } from "./_world.js";

const CSRF_HEADER = { "x-requested-with": "XMLHttpRequest" } as const;
const DEMO_USERNAME = "demo-user";
const DEMO_PASSWORD = "demo-pass-123";

function extractSessionCookie(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  const match = /ai_km_session=[^;]+/.exec(raw ?? "");
  assert.ok(match, `登入回應沒有 ai_km_session cookie:${JSON.stringify(header)}`);
  return match[0];
}

async function realServer(world: KmWorld): Promise<FastifyInstance> {
  return world.startServer({ enableTestAuthProvider: false });
}

async function realLoginCookie(app: FastifyInstance): Promise<string> {
  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { ...CSRF_HEADER },
    payload: { username: DEMO_USERNAME, password: DEMO_PASSWORD },
  });
  assert.equal(login.statusCode, 200, `示範帳號登入應成功:實際 ${login.statusCode} ${login.body}`);
  return extractSessionCookie(login.headers["set-cookie"]);
}

// ---------------------------------------------------------------- Given

Given("the real API server has started the way apps\\/api actually starts it", { timeout: 60_000 }, async function (this: KmWorld) {
  await realServer(this);
});

Given("a demo person has signed in with a real session, not a test shortcut", { timeout: 60_000 }, async function (this: KmWorld) {
  const app = await realServer(this);
  this.bag["mgPhase2Cookie"] = await realLoginCookie(app);
});

// ---------------------------------------------------------------- When

When("someone who has not signed in asks for an embedding", async function (this: KmWorld) {
  const app = await realServer(this);
  this.lastResponse = await app.inject({
    method: "POST",
    url: "/v1/embeddings",
    headers: { ...CSRF_HEADER },
    payload: { input: ["軸承過熱"] },
  });
});

When("someone who has not signed in asks for a generated answer", async function (this: KmWorld) {
  const app = await realServer(this);
  this.lastResponse = await app.inject({
    method: "POST",
    url: "/v1/generate",
    headers: { ...CSRF_HEADER },
    payload: { question: "軸承過熱怎麼處理", context: [] },
  });
});

When("that signed-in person asks for an embedding of {string}", async function (this: KmWorld, text: string) {
  const app = await realServer(this);
  const cookie = this.bag["mgPhase2Cookie"] as string | undefined;
  assert.ok(cookie, "還沒有用真的 session 登入過(Given 沒跑到)");
  this.lastResponse = await app.inject({
    method: "POST",
    url: "/v1/embeddings",
    headers: { ...CSRF_HEADER, cookie },
    payload: { input: [text] },
  });
});

When("that signed-in person asks the gateway to generate an answer from one real source passage", async function (this: KmWorld) {
  const app = await realServer(this);
  const cookie = this.bag["mgPhase2Cookie"] as string | undefined;
  assert.ok(cookie, "還沒有用真的 session 登入過(Given 沒跑到)");
  this.lastResponse = await app.inject({
    method: "POST",
    url: "/v1/generate",
    headers: { ...CSRF_HEADER, cookie },
    payload: {
      question: "軸承過熱怎麼處理",
      context: [
        {
          chunkId: "doc-maint-001#0",
          documentId: "doc-maint-001",
          text: "軸承過熱應先停機並記錄運轉時數",
          startOffset: 0,
          endOffset: 15,
        },
      ],
    },
  });
});

// ---------------------------------------------------------------- Then

Then("the model gateway is present on the running server", function (this: KmWorld) {
  const app = this.app as unknown as { modelGateway?: unknown } | undefined;
  assert.ok(
    app?.modelGateway,
    "app.modelGateway 在真實 buildServer() 的父實例上看不到——modelGatewayPlugin 可能沒註冊," +
      "或註冊了但沒用 fp() 包裝(ADR 0007 §5)。",
  );
});

Then("the refusal names no role or account that would have been let in", function (this: KmWorld) {
  const response = this.lastResponse;
  assert.ok(response, "還沒有送出任何請求");
  const body = response.json() as Record<string, unknown>;
  assert.deepEqual(
    body,
    { code: "UNAUTHENTICATED", message: "請先登入。" },
    "未登入的拒絕回應應該只有固定的 code/message,不帶任何角色、帳號或其他線索——" +
      `多出來的欄位就是洩漏的下一步地圖,實際 ${JSON.stringify(body)}。`,
  );
});
