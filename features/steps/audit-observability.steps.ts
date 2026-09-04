/**
 * 12-audit-observability phase-1 步驟(回填)。
 *
 * 每一步走的入口都是 `apps/api` 自己的 vitest 測試走的那個:真實的
 * `buildServer()`(透過 `_world.ts` 的 `startServer`)+ `app.inject()`,
 * 真實的 `loadConfig()`,真實的 pino stream —— 與 `apps/api/src/server.test.ts`
 * (`GET /v1/health`、correlation id、logging hygiene)和
 * `apps/api/src/health/admin-health.test.ts`(401/403/200 + 四個 subsystem)
 * 完全相同。沒有任何接縫被 mock:唯一的假東西是語音 sidecar,它由
 * `AI_KM_ASR_PROVIDER=fake` 這個既有測試本來就在用的設定關掉。
 *
 * 這個資料夾**沒有** `services/audit`(2026-09-04 `ls services/` 確認),所以
 * 這裡不碰稽核事件本身,只綁「現在真的會做的事」:health、trace id、log 衛生、
 * 詳細報告的角色守門。
 */
import { Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import type { KmWorld } from "./_world.js";

import { loadConfig } from "../../apps/api/src/config.js";

/** pino 的輸出收集器,與 server.test.ts 的 LogSink 同一種做法。 */
interface LogCapture {
  raw: string;
  lines: Record<string, unknown>[];
  write(chunk: string): boolean;
}

function createLogCapture(): LogCapture {
  return {
    raw: "",
    lines: [],
    write(chunk: string): boolean {
      this.raw += chunk;
      for (const line of chunk.split("\n")) {
        if (!line.trim()) continue;
        try {
          this.lines.push(JSON.parse(line) as Record<string, unknown>);
        } catch {
          /* pino 在這裡只會寫 NDJSON */
        }
      }
      return true;
    },
  };
}

function capture(world: KmWorld): LogCapture {
  const sink = world.bag["auditLog"] as LogCapture | undefined;
  assert.ok(sink, "Background 尚未啟動被觀測的 api");
  return sink;
}

/** 這個 scenario 最近一次帶著 trace id 送出的請求所用的 id。 */
function sentTraceId(world: KmWorld): string {
  const id = world.bag["auditTraceId"] as string | undefined;
  assert.ok(id, "還沒有送出帶 trace id 的請求");
  return id;
}

function healthSummary(world: KmWorld): Record<string, unknown> {
  assert.ok(world.lastResponse, "還沒有送出任何請求");
  return world.lastResponse.json() as Record<string, unknown>;
}

function responseBody(world: KmWorld): string {
  assert.ok(world.lastResponse, "還沒有送出任何請求");
  return world.lastResponse.body;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** contracts/openapi/analytics.yaml 的 `/admin/health` x-required-roles,原樣抄來只為斷言「沒有洩漏」。 */
const OPERATOR_ROLE_NAMES = ["it_administrator", "ai_administrator", "auditor", "super_administrator"];
const SUBSYSTEM_NAMES = ["api", "asr", "database", "migrations"];

// ---------------------------------------------------------------- Given

Given(
  "an api whose subsystems are all healthy, with its own log captured",
  { timeout: 120_000 },
  async function (this: KmWorld) {
    const sink = createLogCapture();
    this.bag["auditLog"] = sink;
    // 示範帳號在 identityPlugin 註冊時就 seed 完(services/identity/src/plugin.ts),
    // 所以旗標只在 buildServer 期間存在,不外洩給同一個 cucumber 程序裡別人的 scenario。
    const hadSeedFlag = Object.prototype.hasOwnProperty.call(process.env, "AI_KM_SEED_DEMO_USERS");
    const previousSeedFlag = process.env["AI_KM_SEED_DEMO_USERS"];
    process.env["AI_KM_SEED_DEMO_USERS"] = "true";
    try {
      await this.startServer({
        // ASR 走 in-process 的假 provider(既有測試同一個設定),否則每次 health
        // 都要等一個不存在的 whisper-server 逾時。
        config: loadConfig({ NODE_ENV: "test", AI_KM_ASR_PROVIDER: "fake" }),
        loggerStream: sink,
      });
    } finally {
      if (hadSeedFlag) process.env["AI_KM_SEED_DEMO_USERS"] = previousSeedFlag as string;
      else delete process.env["AI_KM_SEED_DEMO_USERS"];
    }
  },
);

Given("the database connection behind the health check has been closed", async function (this: KmWorld) {
  const app = await this.startServer();
  app.db.close();
});

Given("the person signed in for a health check is {string}", async function (this: KmWorld, username: string) {
  const app = await this.startServer();
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { username, password: "demo-pass-123" },
  });
  assert.equal(res.statusCode, 200, `示範帳號 ${username} 登入失敗:${res.statusCode} ${res.body}`);
  const raw = res.headers["set-cookie"];
  const match = /ai_km_session=[^;]+/.exec(Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? ""));
  assert.ok(match, `登入回應沒有 ai_km_session cookie:${JSON.stringify(raw)}`);
  this.bag["auditSessionCookie"] = match[0];
});

// ---------------------------------------------------------------- When

When("a health check is requested carrying the trace id {string}", async function (this: KmWorld, traceId: string) {
  const app = await this.startServer();
  this.bag["auditTraceId"] = traceId;
  this.lastResponse = await app.inject({
    method: "GET",
    url: "/v1/health",
    headers: { "x-correlation-id": traceId },
  });
});

When(
  "someone signs in sending the password {string}, the cookie {string} and the bearer token {string}",
  async function (this: KmWorld, password: string, cookie: string, bearer: string) {
    const app = await this.startServer();
    this.lastResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: {
        "x-requested-with": "XMLHttpRequest",
        cookie: `ai_km_session=${cookie}`,
        authorization: `Bearer ${bearer}`,
      },
      payload: { username: "demo-user", password },
    });
  },
);

When("the signed-in person asks for the detailed health report", async function (this: KmWorld) {
  const app = await this.startServer();
  const cookie = this.bag["auditSessionCookie"] as string | undefined;
  assert.ok(cookie, "還沒有人登入(Given「the person signed in for a health check is …」)");
  this.lastResponse = await app.inject({
    method: "GET",
    url: "/v1/admin/health",
    headers: { cookie },
  });
});

// ---------------------------------------------------------------- Then

Then("the health summary reports the system as {string}", function (this: KmWorld, status: string) {
  const body = healthSummary(this);
  assert.equal(body["status"], status, `整體狀態應為 ${status},實際 ${JSON.stringify(body["status"])}:${responseBody(this)}`);
});

Then("the health summary carries only the status, the version and the uptime", function (this: KmWorld) {
  const body = healthSummary(this);
  assert.deepEqual(
    Object.keys(body).sort(),
    ["status", "uptimeMs", "version"],
    `未登入者拿到的欄位不只三個:${responseBody(this)}`,
  );
  assert.match(String(body["version"]), /^\d+\.\d+\.\d+$/, `version 應是可辨識部署的版本號,實際 ${JSON.stringify(body["version"])}`);
  assert.equal(typeof body["uptimeMs"], "number", `uptimeMs 應是數字,實際 ${JSON.stringify(body["uptimeMs"])}`);
});

Then("the health summary names no file path, no environment variable and no subsystem", function (this: KmWorld) {
  const raw = responseBody(this);
  for (const name of SUBSYSTEM_NAMES) {
    assert.ok(!raw.includes(`"${name}"`), `未登入者的摘要裡出現子系統名稱 ${name}——內部拓樸洩漏給了沒有證明身分的人:${raw}`);
  }
  assert.ok(!raw.includes("AI_KM_"), `摘要裡出現環境變數名稱:${raw}`);
  assert.ok(!/[A-Za-z]:\\|\/(?:home|data|usr|var|tmp)\//.test(raw), `摘要裡出現檔案系統路徑:${raw}`);
});

Then("the response carries back the trace id {string}", function (this: KmWorld, traceId: string) {
  assert.ok(this.lastResponse, "還沒有送出任何請求");
  assert.equal(
    this.lastResponse.headers["x-correlation-id"],
    traceId,
    `回應應帶回呼叫端給的 trace id ${traceId},實際 ${JSON.stringify(this.lastResponse.headers["x-correlation-id"])}`,
  );
});

Then("the log lines written for that request carry the trace id {string}", function (this: KmWorld, traceId: string) {
  const sink = capture(this);
  const matching = sink.lines.filter((line) => line["correlationId"] === traceId);
  assert.ok(
    matching.length > 0,
    `log 裡沒有任何一行帶 trace id ${traceId},所以這次動作無法被追蹤;實際出現過的 id:${JSON.stringify([...new Set(sink.lines.map((l) => l["correlationId"]))])}`,
  );
});

Then("the response does not carry back the trace id {string}", function (this: KmWorld, traceId: string) {
  assert.ok(this.lastResponse, "還沒有送出任何請求");
  assert.notEqual(
    this.lastResponse.headers["x-correlation-id"],
    traceId,
    `畸形的 trace id 被原樣回送:${traceId}`,
  );
});

Then("no log line written for that request carries the trace id {string}", function (this: KmWorld, traceId: string) {
  const sink = capture(this);
  assert.ok(
    !sink.raw.includes(traceId),
    `畸形的 trace id 進了 log,可以偽造 log 行:${traceId}`,
  );
});

Then("the response carries a freshly minted trace id instead", function (this: KmWorld) {
  assert.ok(this.lastResponse, "還沒有送出任何請求");
  const actual = this.lastResponse.headers["x-correlation-id"];
  assert.match(
    String(actual),
    UUID_V4,
    `被換掉的 trace id 應該是新造的 uuid v4,實際 ${JSON.stringify(actual)}(送出的是 ${sentTraceId(this)})`,
  );
});

Then("the log records that the sign-in was attempted", function (this: KmWorld) {
  const sink = capture(this);
  // 非空洞守門:log 若整個關掉,下面三條「沒有引用祕密」會因為錯誤的理由通過。
  assert.ok(sink.lines.length > 0, "log 一行都沒有——下面的「祕密沒進 log」會是空洞的通過");
  assert.ok(sink.raw.includes("/v1/auth/login"), `log 沒有記到這次登入請求:${sink.raw.slice(-400)}`);
});

Then("no log line quotes {string}", function (this: KmWorld, secret: string) {
  const sink = capture(this);
  assert.ok(!sink.raw.includes(secret), `祕密進了 log:${secret}`);
});

Then("the detailed health report is withheld", function (this: KmWorld) {
  const raw = responseBody(this);
  for (const name of SUBSYSTEM_NAMES) {
    assert.ok(
      !raw.includes(`"${name}"`),
      `詳細健康報告洩漏給了沒有操作者角色的人——回應裡出現子系統 ${name}:${raw}`,
    );
  }
  assert.ok(!raw.includes("checkedAt"), `詳細健康報告洩漏給了沒有操作者角色的人:${raw}`);
  for (const role of OPERATOR_ROLE_NAMES) {
    assert.ok(!raw.includes(role), `拒絕訊息點名了可以通過的角色 ${role},等於告訴攻擊者要拿哪個角色:${raw}`);
  }
});

Then("the detailed health report names the subsystems {string}", function (this: KmWorld, expected: string) {
  assert.ok(this.lastResponse, "還沒有送出任何請求");
  const body = this.lastResponse.json() as { subsystems?: { name: string; status: string }[] };
  const names = (body.subsystems ?? []).map((s) => s.name).sort();
  assert.deepEqual(
    names,
    expected.split(",").map((s) => s.trim()).sort(),
    `詳細報告的子系統清單不同:實際 ${JSON.stringify(names)},回應 ${responseBody(this)}`,
  );
});
