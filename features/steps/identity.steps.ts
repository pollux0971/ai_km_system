/**
 * 01-identity phase-1 步驟(回填)。
 *
 * 每一步呼叫的入口都是 services/identity 自己的 vitest 測試在呼叫的那個:
 * `buildTestApp()`(testing/app.ts — 真實 migration、真實 contract-strict
 * validator、真實 `identityPlugin`)+ `app.inject()`,對應 plugin.test.ts 的
 * 「POST /v1/auth/login」「GET /v1/auth/session」「POST /v1/auth/logout」
 * 「Test sandbox (AC7)」「E04-S048 — CSRF」五個 describe;
 * `createTestDatabase()` + 真實 `register()→ready()`(第一個場景,ADR 0007 §5)。
 * 這裡不 mock 任何接縫:密碼是真的 scrypt,cookie 是真的 Set-Cookie,
 * session 是真的 SQLite 資料列。
 *
 * `@fastify/cookie` 是 `@ai-km/service-identity` 的 devDependency,不是
 * `@ai-km/features` 的——第一個場景要在**裸 server** 上重現 testing/app.ts 的
 * 組裝,所以用 `createRequire` 從 identity 套件自己的解析根載入它,而不是自己
 * 去改 features/package.json(共用檔,只有協調者能改;見 FEATURE.md「待協調」)。
 */
import { After, Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import Fastify, { type FastifyInstance, type FastifyPluginCallback, type LightMyRequestResponse } from "fastify";
import type { KmWorld } from "./_world.js";

import { identityPlugin } from "../../services/identity/src/plugin.js";
import { SESSION_COOKIE_NAME } from "../../services/identity/src/require-session.js";
import { buildTestApp } from "../../services/identity/src/testing/app.js";
import { createTestDatabase } from "../../services/identity/src/testing/db.js";
import { findSessionWithUserByTokenHash } from "../../services/identity/src/repository.js";
import { hashSessionToken } from "../../services/identity/src/crypto.js";
import {
  _resetSandboxSeedersForTest,
  registerSandboxSeeder,
} from "../../services/identity/src/sandbox-seeders.js";

const requireFromIdentity = createRequire(
  new URL("../../services/identity/src/plugin.ts", import.meta.url),
);
const cookiePlugin = requireFromIdentity("@fastify/cookie") as FastifyPluginCallback;

/** 使用者在瀏覽器裡由 @ai-km/api-client 自動帶上的那個標頭(E04-S048)。 */
const CSRF_HEADERS = { "x-requested-with": "XMLHttpRequest" } as const;

/**
 * `@ai-km/features` 沒有(也不該有)`better-sqlite3` 這個相依,直接
 * `import type { Database } from "better-sqlite3"` 在 features 的 tsconfig 下解不到;
 * 從 identity 自己的 helper 推回型別即可,不必動共用的 package.json。
 */
type IdentityDb = ReturnType<typeof createTestDatabase>;

interface IdentityState {
  app: FastifyInstance;
  db: IdentityDb;
  /** 最近一次成功登入拿到的 session cookie 值(依序);多次登入的場景會有多筆 */
  cookies: string[];
  /** sandbox seeder 實際收到的 ownerKey,依呼叫順序 */
  seededOwnerKeys: string[];
}

function state(world: KmWorld): IdentityState {
  const s = world.bag["identity"] as IdentityState | undefined;
  assert.ok(s, "Given 尚未起一個 identity server");
  return s;
}

function response(world: KmWorld): LightMyRequestResponse {
  assert.ok(world.lastResponse, "還沒有送出任何請求(When 要呼叫 app.inject)");
  return world.lastResponse;
}

function setCookieHeaderOf(res: LightMyRequestResponse): string {
  const raw = res.headers["set-cookie"];
  if (raw === undefined) return "";
  return Array.isArray(raw) ? raw.join("\n") : String(raw);
}

function sessionCookieOf(res: LightMyRequestResponse): string {
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(setCookieHeaderOf(res));
  assert.ok(match?.[1], `回應沒有帶 ${SESSION_COOKIE_NAME} cookie:${setCookieHeaderOf(res) || "(沒有 Set-Cookie)"}`);
  return match[1];
}

async function startIdentityServer(world: KmWorld, env: Record<string, string>): Promise<IdentityState> {
  const built = await buildTestApp(env);
  const s: IdentityState = {
    app: built.app,
    db: built.db,
    cookies: [],
    seededOwnerKeys: (world.bag["identitySeededOwnerKeys"] as string[] | undefined) ?? [],
  };
  world.bag["identity"] = s;
  return s;
}

function recordSandboxSeeder(world: KmWorld): string[] {
  // seeder registry 是 module-level 的(sandbox-seeders.ts 的 docstring 說明了
  // 為什麼),所以每個場景先清空再登記自己的,和 plugin.test.ts 的
  // `_resetSandboxSeedersForTest()` afterEach 同一個做法。
  _resetSandboxSeedersForTest();
  const seen: string[] = [];
  registerSandboxSeeder((ownerKey) => {
    seen.push(ownerKey);
  });
  world.bag["identitySeededOwnerKeys"] = seen;
  return seen;
}

async function signIn(
  world: KmWorld,
  username: string,
  password: string,
  options: { withCsrfHeader: boolean },
): Promise<LightMyRequestResponse> {
  const s = state(world);
  const res = await s.app.inject({
    method: "POST",
    url: "/v1/auth/login",
    ...(options.withCsrfHeader ? { headers: { ...CSRF_HEADERS } } : {}),
    payload: { username, password },
  });
  world.lastResponse = res;
  if (res.statusCode === 200) s.cookies.push(sessionCookieOf(res));
  return res;
}

/** 用某個 cookie 值讀一次 session,不動 world.lastResponse(Then 的探針用) */
async function lookUpSession(s: IdentityState, cookie: string): Promise<LightMyRequestResponse> {
  return s.app.inject({
    method: "GET",
    url: "/v1/auth/session",
    cookies: { [SESSION_COOKIE_NAME]: cookie },
  });
}

function ownerKeyOf(s: IdentityState, cookie: string): string | undefined {
  return findSessionWithUserByTokenHash(s.db, hashSessionToken(cookie))?.owner_key;
}

// ---------------------------------------------------------------- Given

Given("an identity plugin bound to its own freshly migrated database", function (this: KmWorld) {
  this.bag["identityBareDb"] = createTestDatabase();
});

Given("an identity server seeded with the demo accounts", { timeout: 60_000 }, async function (this: KmWorld) {
  await startIdentityServer(this, {});
});

Given(
  "an identity server in sandbox mode with a recording sandbox seeder",
  { timeout: 60_000 },
  async function (this: KmWorld) {
    recordSandboxSeeder(this);
    await startIdentityServer(this, { AI_KM_TEST_SANDBOX: "true" });
  },
);

Given(
  "an identity server with a recording sandbox seeder and sandbox mode switched off",
  { timeout: 60_000 },
  async function (this: KmWorld) {
    recordSandboxSeeder(this);
    await startIdentityServer(this, { AI_KM_TEST_SANDBOX: "false" });
  },
);

Given(
  "the person {string} has signed in with password {string}",
  { timeout: 60_000 },
  async function (this: KmWorld, username: string, password: string) {
    const res = await signIn(this, username, password, { withCsrfHeader: true });
    assert.equal(res.statusCode, 200, `前置條件:${username} 應該登入成功,實際 ${res.statusCode}:${res.body}`);
  },
);

// ---------------------------------------------------------------- When

// common.steps.ts 的 `the {string} plugin is registered on a bare server and the
// server becomes ready` 目前無法使用:它的 pattern 有一個 `{string}`,但 handler
// 宣告 0 個參數,cucumber 直接以 arity 錯誤判紅(實測見 FEATURE.md「待協調」)。
// 在協調者修好之前,這裡照 06-retrieval 的做法自己走一次真實的
// `register() → ready()`,並把結果留在 `this.bag["registeredApp"]`——那是通用的
// `the {string} plugin is visible on the parent server instance` 讀的欄位,
// 所以父實例可見性的斷言仍然是共用的那一條(ADR 0007 §5)。
When(
  "the identity plugin is registered on a bare server and that server becomes ready",
  { timeout: 60_000 },
  async function (this: KmWorld) {
    const db = this.bag["identityBareDb"] as IdentityDb | undefined;
    assert.ok(db, "Given 尚未建立 identity 的資料庫");
    // testing/app.ts 的組裝順序:cookie → db → identityPlugin。
    const instance = Fastify({ logger: false });
    await instance.register(cookiePlugin);
    instance.decorate("db", db);
    instance.addHook("onClose", async () => {
      db.close();
    });
    await instance.register(identityPlugin);
    await instance.ready();
    this.bag["registeredApp"] = instance;
  },
);

When(
  "{string} signs in with password {string}",
  { timeout: 60_000 },
  async function (this: KmWorld, username: string, password: string) {
    await signIn(this, username, password, { withCsrfHeader: true });
  },
);

When(
  "{string} signs in with password {string} without the CSRF header",
  { timeout: 60_000 },
  async function (this: KmWorld, username: string, password: string) {
    await signIn(this, username, password, { withCsrfHeader: false });
  },
);

When(
  "{string} signs in twice with password {string}",
  { timeout: 60_000 },
  async function (this: KmWorld, username: string, password: string) {
    await signIn(this, username, password, { withCsrfHeader: true });
    await signIn(this, username, password, { withCsrfHeader: true });
  },
);

When("the session behind that cookie is looked up", async function (this: KmWorld) {
  const s = state(this);
  const cookie = s.cookies.at(-1);
  assert.ok(cookie, "還沒有人登入");
  this.lastResponse = await lookUpSession(s, cookie);
});

When("the signed-in person signs out", async function (this: KmWorld) {
  const s = state(this);
  const cookie = s.cookies.at(-1);
  assert.ok(cookie, "還沒有人登入");
  this.lastResponse = await s.app.inject({
    method: "POST",
    url: "/v1/auth/logout",
    headers: { ...CSRF_HEADERS },
    cookies: { [SESSION_COOKIE_NAME]: cookie },
  });
});

When("a sign-out without the CSRF header is attempted with that session cookie", async function (this: KmWorld) {
  const s = state(this);
  const cookie = s.cookies.at(-1);
  assert.ok(cookie, "還沒有人登入");
  this.lastResponse = await s.app.inject({
    method: "POST",
    url: "/v1/auth/logout",
    cookies: { [SESSION_COOKIE_NAME]: cookie },
  });
});

When("a tampered session cookie is presented to the session endpoint", async function (this: KmWorld) {
  this.lastResponse = await lookUpSession(state(this), "not-a-real-token");
});

// ---------------------------------------------------------------- Then

Then(
  "a sign-in on that bare server names the person {string}",
  { timeout: 60_000 },
  async function (this: KmWorld, userId: string) {
    const app = this.bag["registeredApp"] as FastifyInstance | undefined;
    assert.ok(app, "還沒有透過「the {string} plugin is registered…」註冊過任何 plugin");
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: { ...CSRF_HEADERS },
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    assert.equal(res.statusCode, 200, `裸 server 上的登入應為 200,實際 ${res.statusCode}:${res.body}`);
    assert.equal((res.json() as { userId?: string }).userId, userId);
  },
);

Then(
  "the sign-in identifies the person as {string} in department {string}",
  function (this: KmWorld, userId: string, department: string) {
    const body = response(this).json() as { userId?: string; department?: string };
    assert.equal(body.userId, userId, `登入回應的 userId 應為 ${userId},實際 ${body.userId}`);
    assert.equal(body.department, department, `登入回應的 department 應為 ${department},實際 ${body.department}`);
  },
);

Then("the session cookie is HttpOnly, SameSite=Lax and scoped to the whole site", function (this: KmWorld) {
  const header = setCookieHeaderOf(response(this));
  assert.match(header, new RegExp(`${SESSION_COOKIE_NAME}=`), `沒有 ${SESSION_COOKIE_NAME} cookie:${header || "(沒有 Set-Cookie)"}`);
  assert.match(header, /HttpOnly/i, `session cookie 少了 HttpOnly(頁面上的腳本就讀得到它了):${header}`);
  assert.match(header, /SameSite=Lax/i, `session cookie 少了 SameSite=Lax:${header}`);
  assert.match(header, /Path=\//, `session cookie 的 Path 不是 /:${header}`);
});

Then("the sign-in response never carries the session token", function (this: KmWorld) {
  const res = response(this);
  const cookie = sessionCookieOf(res);
  assert.ok(
    !res.body.includes(cookie),
    `登入回應的 body 裡出現了 session token 本身——它只能存在於 HttpOnly cookie:${res.body}`,
  );
  assert.ok(!res.body.toLowerCase().includes("token"), `登入回應的 body 不該提到 token:${res.body}`);
});

Then("no session cookie is issued", function (this: KmWorld) {
  const header = setCookieHeaderOf(response(this));
  assert.ok(
    !new RegExp(`${SESSION_COOKIE_NAME}=[^;\\s]`).test(header),
    `被拒絕的請求不該發出 session cookie:${header}`,
  );
});

Then("no sign-in attempt is recorded in the identity database", function (this: KmWorld) {
  const row = state(this).db.prepare("SELECT COUNT(*) AS n FROM login_attempts").get() as { n: number };
  assert.equal(
    row.n,
    0,
    `login_attempts 應為 0 筆(請求應在讀密碼之前就被擋下),實際 ${row.n} 筆——CSRF 守門沒有先跑`,
  );
});

Then("the session names the person {string} with role {string}", function (this: KmWorld, userId: string, role: string) {
  const res = response(this);
  assert.equal(res.statusCode, 200, `讀 session 應為 200,實際 ${res.statusCode}:${res.body}`);
  const body = res.json() as { userId?: string; roles?: string[] };
  assert.equal(body.userId, userId, `session 的 userId 應為 ${userId},實際 ${body.userId}`);
  assert.deepEqual(body.roles, [role], `session 的 roles 應為 ["${role}"],實際 ${JSON.stringify(body.roles)}`);
});

Then("the old session cookie no longer names anybody", async function (this: KmWorld) {
  const s = state(this);
  const cookie = s.cookies.at(-1);
  assert.ok(cookie, "還沒有人登入");
  const probe = await lookUpSession(s, cookie);
  assert.equal(
    probe.statusCode,
    401,
    `登出後同一個 cookie 應該再也讀不到 session(401),實際 ${probe.statusCode}:${probe.body}`,
  );
  assert.equal(ownerKeyOf(s, cookie), undefined, "登出後 session 資料列仍留在資料庫裡");
});

Then("the refusal clears the session cookie", function (this: KmWorld) {
  const header = setCookieHeaderOf(response(this));
  assert.match(
    header,
    new RegExp(`${SESSION_COOKIE_NAME}=;`),
    `被拒絕的回應應該清掉 session cookie,實際 Set-Cookie:${header || "(沒有 Set-Cookie)"}`,
  );
});

Then("the session behind that cookie still names {string}", async function (this: KmWorld, userId: string) {
  const s = state(this);
  const cookie = s.cookies.at(-1);
  assert.ok(cookie, "還沒有人登入");
  const row = findSessionWithUserByTokenHash(s.db, hashSessionToken(cookie));
  assert.equal(
    row?.user_id,
    userId,
    `被拒絕的登出不該動到受害者的 session:應仍屬於 ${userId},實際 ${row?.user_id}(undefined = session 已被刪除,受害者被登出了)`,
  );
  const probe = await lookUpSession(s, cookie);
  assert.equal(probe.statusCode, 200, `受害者應該還登入著,實際讀 session 得到 ${probe.statusCode}`);
});

Then("the two sign-ins get different sandbox owner keys", function (this: KmWorld) {
  const s = state(this);
  assert.equal(s.cookies.length, 2, `應該有兩次成功登入,實際 ${s.cookies.length} 次`);
  const [first, second] = s.cookies.map((c) => ownerKeyOf(s, c));
  assert.match(String(first), /^mock-user-1:sbx:/, `第一次登入的 ownerKey 應是沙箱鍵,實際 ${first}`);
  assert.match(String(second), /^mock-user-1:sbx:/, `第二次登入的 ownerKey 應是沙箱鍵,實際 ${second}`);
  assert.notEqual(first, second, `兩次登入拿到同一個沙箱 ownerKey(${first})——沙箱沒有隔離`);
});

Then("the sandbox seeder ran once for each sign-in's own owner key", function (this: KmWorld) {
  const s = state(this);
  const expected = s.cookies.map((c) => ownerKeyOf(s, c));
  assert.deepEqual(
    s.seededOwnerKeys,
    expected,
    `seeder 收到的 ownerKey 依序應為 ${JSON.stringify(expected)},實際 ${JSON.stringify(s.seededOwnerKeys)}`,
  );
});

Then("the session's data owner key is exactly {string}", function (this: KmWorld, userId: string) {
  const s = state(this);
  const cookie = s.cookies.at(-1);
  assert.ok(cookie, "還沒有人登入");
  assert.equal(ownerKeyOf(s, cookie), userId, "沒開沙箱時 ownerKey 必須就是使用者本人的 id");
});

Then("the sandbox seeder never ran", function (this: KmWorld) {
  assert.deepEqual(
    state(this).seededOwnerKeys,
    [],
    `沒開沙箱時不該呼叫任何 seeder,實際被呼叫了:${JSON.stringify(state(this).seededOwnerKeys)}`,
  );
});

// ---------------------------------------------------------------- 收尾

After({ tags: "@identity" }, async function (this: KmWorld) {
  _resetSandboxSeedersForTest();
  const s = this.bag["identity"] as IdentityState | undefined;
  if (s) await s.app.close();
  const bare = this.bag["registeredApp"] as FastifyInstance | undefined;
  if (bare) await bare.close();
});
