/**
 * 02-authorization phase-1 步驟(回填)。
 *
 * 每一步呼叫的入口都是既有 vitest 測試在呼叫的那個:
 * `toRetrievalScope` / `buildScopePredicate` / `buildScopeSql` /
 * `assertNoScopeLeak`(`services/retrieval/src/authorization/scope.test.ts`
 * 的 PF0 八條),以及真實 `buildServer()` + 真實登入
 * (`services/identity/src/plugin.test.ts` 的 AC1/AC4)。這裡不 mock 任何接縫,
 * 也不重複 06-retrieval 的「用 scope 去查 store」——那一層是那個資料夾的。
 */
import { Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import type { KmWorld } from "./_world.js";

import {
  assertNoScopeLeak,
  buildScopePredicate,
  buildScopeSql,
  toRetrievalScope,
  type RetrievalScope,
  type ScopedRecord,
} from "../../services/retrieval/src/authorization/scope.js";

interface AuthorizationState {
  /** Given 記下來的身分與授權清單(尚未建成 scope) */
  principalId: string;
  grants: readonly string[];
  scope?: RetrievalScope;
  filter?: { readonly sql: string; readonly params: readonly string[] };
  /** 送進洩漏檢查的那一批資料 */
  submitted?: readonly ScopedRecord[];
  /** 洩漏檢查回傳的那一批(沒拋錯時) */
  handedBack?: readonly ScopedRecord[];
  /** 真實登入後 GET /v1/auth/session 的內容 */
  identity?: Record<string, unknown>;
  /**
   * phase-2(提案,紅):把身分的原始欄位(部門/群組顯示名稱)直接當成
   * scope 鑰匙餵給既有的 toRetrievalScope() 所得到的結果——這是今天的
   * 程式碼唯一做得到的事,不是正確的轉換(那個轉換是 phase-2 要建的)。
   */
  attemptedScope?: RetrievalScope;
  /** phase-2(提案,紅):這個人被明確拒絕的鑰匙——今天沒有任何機制會套用它 */
  deniedKeys?: readonly string[];
}

function state(world: KmWorld): AuthorizationState {
  const s = world.bag["authorization"] as AuthorizationState | undefined;
  assert.ok(s, "Given 尚未描述任何一個人的授權範圍");
  return s;
}

/** "dept:a, dept:b" → ["dept:a", "dept:b"];"" → [] */
function parseKeys(list: string): string[] {
  return list
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

function scopeOf(world: KmWorld): RetrievalScope {
  const s = state(world);
  assert.ok(
    s.scope,
    `授權範圍還沒建成(可能被拒絕:${world.lastError?.name} ${world.lastError?.message})`,
  );
  return s.scope;
}

/** phase-2(提案,紅):讀「用身分原始欄位硬套」得到的那個嘗試性 scope */
function attemptedScopeOf(world: KmWorld): RetrievalScope {
  const s = state(world);
  assert.ok(
    s.attemptedScope,
    `還沒有嘗試從身分建立授權範圍(可能被拒絕:${world.lastError?.name} ${world.lastError?.message})`,
  );
  return s.attemptedScope;
}

function describeGrants(s: AuthorizationState): string {
  return s.grants.length === 0 ? "(沒有任何授權)" : s.grants.join(", ");
}

// ---------------------------------------------------------------- Given

Given("a person {string} whose grants are exactly {string}", function (this: KmWorld, principalId: string, grants: string) {
  this.bag["authorization"] = { principalId, grants: parseKeys(grants) } satisfies AuthorizationState;
});

// ---------------------------------------------------------------- When

When("that person's authorization scope is built", function (this: KmWorld) {
  const s = state(this);
  try {
    s.scope = toRetrievalScope({ principalId: s.principalId, allowedScopeKeys: s.grants });
  } catch (error) {
    this.lastError = error as Error;
  }
});

When(
  "that person's authorization scope is turned into a database filter on {string}",
  function (this: KmWorld, column: string) {
    const s = state(this);
    try {
      s.scope = toRetrievalScope({ principalId: s.principalId, allowedScopeKeys: s.grants });
      s.filter = buildScopeSql(s.scope, column);
    } catch (error) {
      this.lastError = error as Error;
    }
  },
);

When("records labelled {string} are checked on their way out", function (this: KmWorld, labels: string) {
  const s = state(this);
  const scope = scopeOf(this);
  const records: readonly ScopedRecord[] = parseKeys(labels).map((scopeKey) => ({ scopeKey }));
  s.submitted = records;
  try {
    s.handedBack = assertNoScopeLeak(scope, records);
  } catch (error) {
    this.lastError = error as Error;
  }
});

When(
  "the authorization layer looks up the signed-in identity of {string}",
  { timeout: 60_000 },
  async function (this: KmWorld, username: string) {
    const app = await this.startServer();
    // 與 apps/api/src/health/admin-health.test.ts 的 loginAs 同一條路徑:
    // 真實 POST /v1/auth/login,拿真實 session cookie,再讀真實 session。
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: { "x-requested-with": "XMLHttpRequest" },
      payload: { username, password: "demo-pass-123" },
    });
    assert.equal(login.statusCode, 200, `登入 ${username} 應成功,實際 ${login.statusCode}:${login.body}`);
    const raw = login.headers["set-cookie"];
    const cookie = /ai_km_session=[^;]+/.exec((Array.isArray(raw) ? raw[0] : raw) ?? "")?.[0];
    assert.ok(cookie, `登入 ${username} 沒有拿到 session cookie:${JSON.stringify(raw)}`);
    const session = await app.inject({ method: "GET", url: "/v1/auth/session", headers: { cookie } });
    assert.equal(session.statusCode, 200, `讀取 session 應成功,實際 ${session.statusCode}:${session.body}`);
    this.bag["authorization"] = {
      principalId: username,
      grants: [],
      identity: session.json() as Record<string, unknown>,
    } satisfies AuthorizationState;
  },
);

// ---------------------------------------------------------------- Then

Then("the scope admits a record labelled {string}", function (this: KmWorld, label: string) {
  const s = state(this);
  const allow = buildScopePredicate(scopeOf(this));
  assert.equal(
    allow({ scopeKey: label }),
    true,
    `授權範圍 [${describeGrants(s)}] 應接受標記為「${label}」的資料,實際判定為拒絕`,
  );
});

Then("the scope refuses a record labelled {string}", function (this: KmWorld, label: string) {
  const s = state(this);
  const allow = buildScopePredicate(scopeOf(this));
  assert.equal(
    allow({ scopeKey: label }),
    false,
    `授權範圍 [${describeGrants(s)}] 不含「${label}」,卻接受了標記為「${label}」的資料——Deny-Wins 失效`,
  );
});

Then("the scope refuses a record with no label at all", function (this: KmWorld) {
  const s = state(this);
  const allow = buildScopePredicate(scopeOf(this));
  assert.equal(
    allow({} as ScopedRecord),
    false,
    `授權範圍 [${describeGrants(s)}] 接受了沒有 scopeKey 的資料——沒有標記不等於公開`,
  );
});

Then("the scope names the person as {string}", function (this: KmWorld, principalId: string) {
  assert.equal(scopeOf(this).principalId, principalId, "授權範圍記下的身分不是這個人");
});

Then("the refusal blames the missing principal rather than the grants", function (this: KmWorld) {
  assert.ok(this.lastError, "預期會被拒絕,但沒有任何錯誤被拋出");
  const message = this.lastError.message;
  assert.ok(
    message.includes("principalId"),
    `拒絕理由應指名 principalId,實際訊息:${message}`,
  );
  assert.ok(
    !message.includes("allowedScopeKeys"),
    `拒絕理由不該指向 allowedScopeKeys——授權清單是合法的,缺的是身分。實際訊息:${message}`,
  );
});

Then(
  "the filter reads {string} and carries the values {string}",
  function (this: KmWorld, sql: string, values: string) {
    const s = state(this);
    assert.ok(s.filter, `還沒產生任何資料庫過濾條件(可能被拒絕:${this.lastError?.message})`);
    assert.equal(s.filter.sql, sql, `過濾條件應為「${sql}」,實際「${s.filter.sql}」`);
    assert.deepEqual(
      [...s.filter.params],
      parseKeys(values),
      `過濾條件帶的值應為 [${parseKeys(values).join(", ")}],實際 [${s.filter.params.join(", ")}]`,
    );
    assert.ok(
      !s.filter.sql.includes("IN ()"),
      `零授權絕不可產生空的 IN ()——查詢建構器常把它「好心」省略,把 deny-all 變成 allow-all。實際「${s.filter.sql}」`,
    );
  },
);

Then("the refusal names the department {string}", function (this: KmWorld, department: string) {
  assert.ok(
    this.lastError,
    `越界資料應該讓檢查拋錯,實際安靜回傳了 ${state(this).handedBack?.length} 筆——靜默過濾會把真正的缺陷留在原地`,
  );
  assert.ok(
    this.lastError.message.includes(department),
    `拒絕訊息應指名越界的部門「${department}」,實際訊息:${this.lastError.message}`,
  );
});

Then("the refusal does not name the department {string}", function (this: KmWorld, department: string) {
  assert.ok(this.lastError, "沒有被拒絕");
  assert.ok(
    !this.lastError.message.includes(department),
    `「${department}」在授權範圍內,不該出現在越界清單裡。實際訊息:${this.lastError.message}`,
  );
});

Then("the authorization check hands back the very same records", function (this: KmWorld) {
  const s = state(this);
  assert.ok(
    !this.lastError,
    `全部合規時不該拋錯,實際:${this.lastError?.name} ${this.lastError?.message}`,
  );
  assert.ok(s.submitted && s.handedBack, "還沒做過洩漏檢查");
  assert.deepEqual(
    s.handedBack.map((r) => r.scopeKey),
    s.submitted.map((r) => r.scopeKey),
    "回傳的資料與送進去的不同——這個檢查只准放行或拋錯,不准動內容或順序",
  );
  assert.equal(s.handedBack, s.submitted, "回傳的不是同一份資料(被複製或重建過)");
});

Then(
  "the identity names department {string} and group {string}",
  function (this: KmWorld, department: string, group: string) {
    const identity = state(this).identity;
    assert.ok(identity, "還沒讀到任何已登入的身分");
    assert.equal(identity["department"], department, `身分的部門應為「${department}」,實際「${String(identity["department"])}」`);
    assert.equal(identity["group"], group, `身分的群組應為「${group}」,實際「${String(identity["group"])}」`);
  },
);

Then("the identity hands over no ready-made scope keys", function (this: KmWorld) {
  const identity = state(this).identity;
  assert.ok(identity, "還沒讀到任何已登入的身分");
  const scopeish = Object.keys(identity).filter((k) => /scope/i.test(k));
  assert.deepEqual(
    scopeish,
    [],
    `身分裡出現了看起來像授權範圍的欄位 [${scopeish.join(", ")}]——` +
      `部門／群組 → scopeKey 的對應是 E04-S009,還沒有人裁定;` +
      `在那之前建過渡對應表是 E04-S062 明文禁止的(見 NEXT.md)。`,
  );
});

// ==================================================================
// phase-2(提案,紅)—— 從 identity 的 session 產出 RetrievalScope。
// 下面每一步都只呼叫既有的 toRetrievalScope / buildScopePredicate
// (phase-1 已經在用的入口),不 import 任何新的實作符號——紅只會發生
// 在斷言,不會發生在編譯,typecheck/lint 不受影響。細節見
// phase-2.feature 開頭的說明與 FEATURE.md。
// ==================================================================

// ---------------------------------------------------------------- When

When(
  "that identity's session fields alone are used to attempt an authorization scope",
  function (this: KmWorld) {
    const s = state(this);
    const identity = s.identity;
    assert.ok(identity, "還沒讀到任何已登入的身分");
    try {
      s.attemptedScope = toRetrievalScope({
        principalId: String(identity["userId"] ?? s.principalId),
        // 這裡刻意直接用身分的原始欄位(部門/群組「顯示名稱」)當鑰匙——
        // 這是今天的程式碼唯一做得到的事。ADR 0012 裁定 1 明講顯示名永遠
        // 不當鑰匙,所以這一步產出的 scope 預期是「錯的」,Then 那一步的
        // 斷言會證明這件事。
        allowedScopeKeys: [String(identity["department"]), String(identity["group"])],
      });
    } catch (error) {
      this.lastError = error as Error;
    }
  },
);

// ---------------------------------------------------------------- Given

Given(
  "that person has also been explicitly denied {string}",
  function (this: KmWorld, deniedKey: string) {
    const s = state(this);
    s.deniedKeys = [...(s.deniedKeys ?? []), deniedKey];
  },
);

// phase-2b(提案,紅/綠混合):明寫「明確拒絕清單是空的」,而不是單純不呼叫
// 上面那個 Given——這樣才對得上工單裁定 4「呼叫端此刻全部傳 []」的字面意思
// (一個明寫的空陣列,不是「沒接上」)。
Given("that person has explicitly denied nothing", function (this: KmWorld) {
  const s = state(this);
  s.deniedKeys = [];
});

// ---------------------------------------------------------------- Then

Then(
  "the attempted scope should admit a record labelled {string} but does not",
  function (this: KmWorld, label: string) {
    const identity = state(this).identity;
    assert.ok(identity, "還沒讀到任何已登入的身分");
    const allow = buildScopePredicate(attemptedScopeOf(this));
    assert.equal(
      allow({ scopeKey: label }),
      true,
      `身分的原始欄位(部門「${String(identity["department"])}」/群組「${String(identity["group"])}」)` +
        `today 沒有任何轉換規則能變成「${label}」這把鑰匙——` +
        `ADR 0012 裁定 1 定了鑰匙的形狀(dept:<department.id> / group:<group.id>),` +
        `但 01-identity 今天完全沒有 id 欄位,只有顯示名稱(db/migrations/202608280002_identity.sql)。` +
        `這正是 phase-2 要補的轉換層;在它存在之前,這個人連自己部門/群組的文件都打不開—— ` +
        `查無資料,不是拒絕存取,兩者對使用者看起來一樣,但成因不同。`,
    );
  },
);

Then(
  "the scope should refuse a record labelled {string} because of the explicit denial, but it does not",
  function (this: KmWorld, label: string) {
    const s = state(this);
    const allow = buildScopePredicate(scopeOf(this));
    assert.equal(
      allow({ scopeKey: label }),
      false,
      `「${s.principalId}」被明確拒絕存取「${label}」(明確拒絕清單:${(s.deniedKeys ?? []).join(", ") || "(空)"}),` +
        `但 toRetrievalScope() 今天只認得 allowedScopeKeys 這一份允許清單,` +
        `沒有任何欄位能表達「即使在允許清單裡,這把鑰匙仍然要被擋下」—— ` +
        `ADR 0012 裁定 4(顯式 ACL deny 蓋過 allow,不是「取交集」的窄化)今天沒有對應機制承接, ` +
        `這正是 phase-2 要補的洞:算太寬,靜默放行了本該被擋下的資料。`,
    );
  },
);

// phase-2b(提案,紅):SQL 這一層的裁定 3——denied 應該直接不進 IN 清單
// (前置過濾),不是「查完再濾」。今天 buildScopeSql() 只讀 allowedScopeKeys,
// 沒有任何欄位可以表達顯式拒絕,所以被 deny 的鑰匙仍然出現在參數列表裡。
Then(
  "the filter must not include {string} in its parameter list because of the explicit denial, but it does",
  function (this: KmWorld, deniedKey: string) {
    const s = state(this);
    assert.ok(s.filter, `還沒產生任何資料庫過濾條件(可能被拒絕:${this.lastError?.message})`);
    const included = s.filter.params.includes(deniedKey);
    assert.equal(
      included,
      false,
      `「${deniedKey}」已被「${s.principalId}」明確拒絕(明確拒絕清單:${(s.deniedKeys ?? []).join(", ") || "(空)"}),` +
        `依 ADR 0012 裁定 3,denied 應該直接不進 IN 清單(前置過濾,比「查完再濾」更接近` +
        `「授權在檢索之前」)。但 buildScopeSql() 今天只讀 allowedScopeKeys,產生的 SQL 是` +
        `「${s.filter.sql}」、參數列表是 [${s.filter.params.join(", ")}]——「${deniedKey}」仍在其中,` +
        `代表被擋下的部門的資料仍然會被送進資料庫查詢、讀回 process。`,
    );
  },
);
