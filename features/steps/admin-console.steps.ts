/**
 * 10-admin-console phase-1 步驟(回填)。
 *
 * 每一步走的入口都是既有 vitest 測試在走的那一個,不 mock 任何接縫:
 *
 * - `/v1/admin/health` 的角色守門 → 真實 `buildServer()` + 真實登入 + `inject()`,
 *   與 `apps/api/src/health/admin-health.test.ts` 完全同一條路(該檔刻意不用
 *   `x-test-user`,因為那個假身分永遠帶 `roles: []`,過不了也證明不了守門)。
 * - 「誰看得到哪一頁」 → `rolesRequiredForAdminRoute()`,與
 *   `apps/admin/src/lib/admin-route-access.test.ts` 同一個函式。
 * - 部門／群組／連接器清單 → `listDepartments()`/`createDepartment()`/
 *   `listGroups()`/`listConnectors()`,與 `apps/admin/src/lib/*.test.ts` 同一組函式。
 *
 * ## 為什麼 apps/admin 那三個模組是動態 import
 *
 * `departments.ts`/`groups.ts`/`connectors.ts` 在 `typeof window === "undefined"`
 * 時回傳種子資料,所以在 node 底下跑得好好的(已實測)。但它們的原始碼提到 `window`,
 * 而 `features/tsconfig.json` 的 `lib` 只有 `["ES2022"]`、沒有 `DOM`——靜態 import
 * 會把這三個檔拉進 features 的 TS program,用錯的 lib 設定重新型別檢查一次,產生
 * 四個 `Cannot find name 'window'`。那三個檔的正確型別檢查本來就由它們自己的 package
 * 做(`apps/admin/tsconfig.json` 有 DOM,`pnpm typecheck` 會跑到),不該在這裡重做。
 *
 * `features/tsconfig.json` 是協調者才能改的共用檔,所以這裡用計算出來的 specifier
 * 做動態 import(TS 不會把它拉進 program),並在本檔宣告這三個模組的介面——**介面是
 * 轉接用的型別,不是重寫的邏輯**,值全部來自真實模組。
 * FEATURE.md 的「待協調」已請協調者在 `features/tsconfig.json` 的 `lib` 加上 `"DOM"`,
 * 加了之後這一段可以直接換成普通的 static import,場景與斷言一行都不用動。
 */
import { Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import type { LightMyRequestResponse } from "fastify";
import type { KmWorld } from "./_world.js";

import { rolesRequiredForAdminRoute } from "../../apps/admin/src/lib/admin-route-access.js";
import { loadConfig } from "../../apps/api/src/config.js";

/**
 * `startServer()`(`_world.ts`)只傳 `enableTestAuthProvider`,不傳 config,
 * 所以不寫這個就會落到預設 `asrProvider: "whisper-server"` +
 * `AI_KM_ASR_SERVER_URL: http://127.0.0.1:8178`——每個健康場景對本機發一次真實
 * fetch(2s timeout),結果依機器上有沒有跑著 whisper-server 而定(2026-09-04
 * 獨立審核實測:同一份測試在兩台機器上驗的東西不同)。與這個資料夾回填對照的
 * `admin-health.test.ts` 一樣明確傳 `AI_KM_ASR_PROVIDER: "fake"`,這裡跟著做,
 * 讓 asr 讀數變成確定的 `ok`,不再是環境依賴的量測。
 */
const ADMIN_HEALTH_SERVER_CONFIG = loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent", AI_KM_ASR_PROVIDER: "fake" });

/**
 * `phase-1.feature` 的 Given 步驟文字是共用的「a fresh server with fake providers」
 * (`common.steps.ts:23`,不可改——共用檔),它呼叫 `this.startServer()` **不傳 config**,
 * 而 `startServer()` 只要 `this.app` 已存在就直接回傳快取的實例(見 `_world.ts` 的
 * `if (this.app) return this.app;`)。所以等這個資料夾自己的 When 步驟跑到時,server
 * 早就用預設(真的 whisper-server)config 建好了,再傳 `extra` 也不會被採用——這是
 * 實測抓到的,不是用讀的推出來的(GHERKIN_WORKFLOW §5.3)。修法:在這裡的 When 步驟裡
 * 把 Given 步驟建的那個實例關掉、重建一個帶正確 config 的,只動這個資料夾自己的檔,
 * 不改 `common.steps.ts` 的共用 Given。
 */
async function restartServerWithFakeAsr(world: KmWorld): Promise<import("fastify").FastifyInstance> {
  if (world.app) {
    await world.app.close();
    world.app = undefined;
  }
  return world.startServer({ config: ADMIN_HEALTH_SERVER_CONFIG });
}

// ------------------------------------------------- apps/admin 的三個 in-app store

type AdminResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

interface AdminDataModules {
  listDepartments(): Promise<AdminResult<{ departmentId: string; name: string }[]>>;
  createDepartment(input: { name: string }): Promise<AdminResult<{ departmentId: string; name: string }>>;
  listGroups(): Promise<AdminResult<{ groupId: string; name: string }[]>>;
  listConnectors(): Promise<AdminResult<{ id: string; name: string; status: "enabled" | "disabled" }[]>>;
}

let adminDataCache: AdminDataModules | undefined;

/** 見檔頭「為什麼是動態 import」。specifier 是算出來的,TS 不會把目標檔拉進 program。 */
async function adminData(): Promise<AdminDataModules> {
  if (adminDataCache) return adminDataCache;
  const load = async (file: string): Promise<Record<string, unknown>> =>
    (await import(new URL(`../../apps/admin/src/lib/${file}.ts`, import.meta.url).href)) as Record<string, unknown>;
  const [departments, groups, connectors] = await Promise.all([load("departments"), load("groups"), load("connectors")]);
  adminDataCache = {
    listDepartments: departments["listDepartments"],
    createDepartment: departments["createDepartment"],
    listGroups: groups["listGroups"],
    listConnectors: connectors["listConnectors"],
  } as unknown as AdminDataModules;
  return adminDataCache;
}

// ------------------------------------------------------------------ helpers

const ADMIN_HEALTH_PATH = "/v1/admin/health";
const DEMO_PASSWORD = "demo-pass-123";
/** contracts/openapi/analytics.yaml `/admin/health` 的 x-required-roles,原文照抄 */
const ROLES_THAT_WOULD_BE_LET_IN = ["it_administrator", "ai_administrator", "auditor", "super_administrator"];
/**
 * 修好(1)之後(server 一律以 `AI_KM_ASR_PROVIDER: "fake"` 啟動),四個子系統在這個
 * throwaway、剛跑完 migration 的 SQLite 上是確定的:`api` 恆 ok(能跑到這行程式碼
 * 本身就代表 up)、`database` 對真實檔案(非 :memory:)的 WAL journal 是 ok、
 * `migrations` 因 `autoMigrate` 預設 true 而無 pending 是 ok、`asr` 因 fake provider
 * 恆 ok(`checkAsr`)。釘住這四個值,而不是只驗「落在 admin console 認得的值域裡」
 * ——後者對「checkAsr 無條件回 ok」這種靜默錯誤(健康檢查說謊)測不出來
 * (2026-09-04 獨立審核實測:14 scenarios 全過,一條都沒紅)。
 */
const EXPECTED_SUBSYSTEM_STATUSES: Record<string, string> = { api: "ok", database: "ok", migrations: "ok", asr: "ok" };

interface SubsystemReading {
  name: string;
  status: string;
  detail?: string;
}

function response(world: KmWorld): LightMyRequestResponse {
  assert.ok(world.lastResponse, "還沒有向 admin console 的後端送出任何請求(When 沒跑到)");
  return world.lastResponse;
}

/** 回應裡的子系統讀數;不是 JSON、或沒有 subsystems,一律視為「沒有讀數」 */
function subsystemReadings(res: LightMyRequestResponse): SubsystemReading[] {
  try {
    const body = JSON.parse(res.body) as { subsystems?: unknown };
    return Array.isArray(body.subsystems) ? (body.subsystems as SubsystemReading[]) : [];
  } catch {
    return [];
  }
}

function whoAsked(world: KmWorld): string {
  return (world.bag["adminConsoleIdentity"] as string | undefined) ?? "(未指定身分)";
}

function commaList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function extractSessionCookie(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  const match = /ai_km_session=[^;]+/.exec(raw ?? "");
  assert.ok(match, `登入回應沒有 ai_km_session cookie:${JSON.stringify(header)}`);
  return match[0];
}

function adminResultOf<T>(world: KmWorld): AdminResult<T> {
  const result = world.bag["adminConsoleResult"] as AdminResult<T> | undefined;
  assert.ok(result, "admin console 還沒有回傳任何結果(When 沒跑到)");
  return result;
}

function adminValue<T>(world: KmWorld): T {
  const result = adminResultOf<T>(world);
  assert.ok(result.ok, `admin console 這次操作應該成功,實際被拒:${result.ok ? "" : JSON.stringify(result.error)}`);
  return result.value;
}

// --------------------------------------------------------------------- When

When(
  "{string} signs in to the admin console and opens the system health page",
  { timeout: 60_000 },
  async function (this: KmWorld, username: string) {
    const app = await restartServerWithFakeAsr(this);
    this.bag["adminConsoleIdentity"] = username;
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: { "x-requested-with": "XMLHttpRequest" },
      payload: { username, password: DEMO_PASSWORD },
    });
    assert.equal(login.statusCode, 200, `示範帳號「${username}」登入失敗:${login.statusCode} ${login.body}`);
    const cookie = extractSessionCookie(login.headers["set-cookie"]);
    this.lastResponse = await app.inject({ method: "GET", url: ADMIN_HEALTH_PATH, headers: { cookie } });
  },
);

When(
  "nobody signs in to the admin console and the system health page is opened",
  { timeout: 60_000 },
  async function (this: KmWorld) {
    const app = await restartServerWithFakeAsr(this);
    this.bag["adminConsoleIdentity"] = "(沒有登入的人)";
    this.lastResponse = await app.inject({ method: "GET", url: ADMIN_HEALTH_PATH });
  },
);

When("the admin console is asked who may open {string}", function (this: KmWorld, page: string) {
  this.bag["adminConsolePage"] = page;
  this.bag["adminConsoleAdmits"] = rolesRequiredForAdminRoute(page);
});

When("an administrator opens the admin console's department list", async function (this: KmWorld) {
  this.bag["adminConsoleResult"] = await (await adminData()).listDepartments();
});

When("an administrator opens the admin console's group list", async function (this: KmWorld) {
  this.bag["adminConsoleResult"] = await (await adminData()).listGroups();
});

When("an administrator opens the admin console's connector list", async function (this: KmWorld) {
  this.bag["adminConsoleResult"] = await (await adminData()).listConnectors();
});

When("an administrator adds a department named {string} in the admin console", async function (this: KmWorld, name: string) {
  this.bag["adminConsoleResult"] = await (await adminData()).createDepartment({ name });
});

// --------------------------------------------------------------------- Then

Then("the admin console shows readings for the subsystems {string}", function (this: KmWorld, expected: string) {
  const res = response(this);
  const actual = subsystemReadings(res)
    .map((reading) => reading.name)
    .sort();
  assert.deepEqual(
    actual,
    commaList(expected).sort(),
    `「${whoAsked(this)}」看到的子系統應為 [${commaList(expected).sort().join(", ")}],實際 [${actual.join(", ")}](HTTP ${res.statusCode}):${res.body.slice(0, 300)}`,
  );
});

Then("every subsystem reading carries a status the admin console can display", function (this: KmWorld) {
  const res = response(this);
  const readings = subsystemReadings(res);
  assert.ok(readings.length > 0, `沒有任何子系統讀數可以檢查(HTTP ${res.statusCode}):${res.body.slice(0, 300)}`);
  const actual = Object.fromEntries(readings.map((reading) => [reading.name, reading.status]));
  assert.deepEqual(
    actual,
    EXPECTED_SUBSYSTEM_STATUSES,
    `子系統狀態應為 ${JSON.stringify(EXPECTED_SUBSYSTEM_STATUSES)},實際 ${JSON.stringify(actual)}(HTTP ${res.statusCode}):${res.body.slice(0, 300)}`,
  );
});

Then("the admin console shows no subsystem reading at all", function (this: KmWorld) {
  const res = response(this);
  const leaked = subsystemReadings(res).map((reading) => `${reading.name}=${reading.status}`);
  assert.deepEqual(
    leaked,
    [],
    `「${whoAsked(this)}」不得看到任何子系統讀數,但 HTTP ${res.statusCode} 洩漏了 ${leaked.length} 筆:${leaked.join(", ")}|整個回應:${res.body.slice(0, 300)}`,
  );
  assert.ok(
    !res.body.includes("subsystems"),
    `「${whoAsked(this)}」的回應本體不得出現 subsystems 欄位(HTTP ${res.statusCode}):${res.body.slice(0, 300)}`,
  );
});

Then("the refusal names none of the roles the admin console would have let in", function (this: KmWorld) {
  const res = response(this);
  const named = ROLES_THAT_WOULD_BE_LET_IN.filter((role) => res.body.includes(role));
  assert.deepEqual(named, [], `拒絕訊息不得列出可通過的角色(那是給未授權者的下一步地圖),實際提到:${named.join(", ")}|回應:${res.body.slice(0, 300)}`);
});

Then("the admin console admits exactly {string}", function (this: KmWorld, expected: string) {
  const page = this.bag["adminConsolePage"] as string;
  const admits = this.bag["adminConsoleAdmits"] as string[] | undefined;
  assert.deepEqual(admits, commaList(expected), `「${page}」應只允許 [${commaList(expected).join(", ")}](含順序),實際 ${JSON.stringify(admits)}`);
});

Then("the admin console admits nobody at all", function (this: KmWorld) {
  const page = this.bag["adminConsolePage"] as string;
  const admits = this.bag["adminConsoleAdmits"] as string[] | undefined;
  assert.equal(admits, undefined, `「${page}」沒有登記在授權表裡,必須誰都不允許(fail closed),實際 ${JSON.stringify(admits)}`);
});

Then("the admin console lists the departments {string}", function (this: KmWorld, expected: string) {
  const names = adminValue<{ name: string }[]>(this).map((department) => department.name);
  assert.deepEqual(names, commaList(expected), `部門清單應為 [${commaList(expected).join(", ")}],實際 [${names.join(", ")}]`);
});

Then("the admin console lists the groups {string}", function (this: KmWorld, expected: string) {
  const names = adminValue<{ name: string }[]>(this).map((group) => group.name);
  assert.deepEqual(names, commaList(expected), `群組清單應為 [${commaList(expected).join(", ")}],實際 [${names.join(", ")}]`);
});

Then("the admin console lists the connectors {string}", function (this: KmWorld, expected: string) {
  const ids = adminValue<{ id: string }[]>(this).map((connector) => connector.id);
  assert.deepEqual(ids, commaList(expected), `連接器清單應為 [${commaList(expected).join(", ")}],實際 [${ids.join(", ")}]`);
});

Then("every connector in the admin console is switched off", function (this: KmWorld) {
  const connectors = adminValue<{ id: string; status: string }[]>(this);
  const switchedOn = connectors.filter((connector) => connector.status !== "disabled");
  assert.deepEqual(
    switchedOn.map((connector) => `${connector.id}=${connector.status}`),
    [],
    "沒有任何連接器實際接上過,所以每一個的狀態都必須是 disabled",
  );
});

Then("the admin console rejects the change with {string}", function (this: KmWorld, code: string) {
  const result = adminResultOf<unknown>(this);
  assert.ok(!result.ok, `這個操作應該被拒絕,實際成功並回傳:${JSON.stringify(result.ok ? result.value : undefined)}`);
  assert.equal(result.error.code, code, `錯誤碼應為 ${code},實際 ${result.error.code}`);
});

Then("the admin console explains {string}", function (this: KmWorld, message: string) {
  const result = adminResultOf<unknown>(this);
  assert.ok(!result.ok, "這個操作應該被拒絕,才會有說明訊息");
  assert.equal(result.error.message, message, `說明訊息應為「${message}」,實際「${result.error.message}」`);
});
