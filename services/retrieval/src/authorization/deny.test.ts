import { describe, expect, it } from "vitest";
import { buildScopePredicate, buildScopeSql, toRetrievalScope } from "./scope.js";

/**
 * phase-2b(2026-09-04)—— ADR 0012 對 E04-S009 剩下那題(顯式 ACL deny 蓋過
 * allow)的完整形狀裁定。細節見 features/02-authorization/phase-2.feature 開頭
 * 與 FEATURE.md「phase-2b 提案」段。
 *
 * 第一輪(測試 agent)寫下這四條時,`RetrievalScope` 還只有 `allowedScopeKeys`
 * 一個欄位,所以刻意不把 denied 傳進 `toRetrievalScope()`——那樣會撞 excess
 * property check,紅在編譯而非行為。第二輪(開發 agent)把 `deniedScopeKeys`
 * 接進 `scope.ts`(`RetrievalScope.deniedScopeKeys`、`buildScopePredicate`、
 * `buildScopeSql`、`assertNoScopeLeak` 都認得它了,輸入端 `deniedScopeKeys` 是
 * optional、省略視為 `[]`——理由見 `scope.ts` 的 `toRetrievalScope` 注解)。
 * 這一輪(測試 agent,第三輪)把 denied 清單真的接進 `toRetrievalScope()`,
 * 四條測試現在驗證的是實際行為,不再是「這個洞還沒補」。
 */
describe("RetrievalScope — 裁定 4:顯式 ACL deny 蓋過 allow(phase-2b)", () => {
  it("允許清單裡的鑰匙一旦被明確 deny,謂詞就拒絕它——Deny-Wins 蓋過 allow", () => {
    const denied = ["dept:it"];
    const scope = toRetrievalScope({
      principalId: "u-1",
      allowedScopeKeys: ["dept:it", "group:general"],
      deniedScopeKeys: denied,
    });
    const allow = buildScopePredicate(scope);

    expect(
      allow({ scopeKey: "dept:it" }),
      `dept:it 同時在允許清單與明確拒絕清單(denied=[${denied.join(", ")}])裡,依 Deny-Wins ` +
        `應該被拒絕。buildScopePredicate() 認得 deniedScopeKeys,一個被明確擋下的部門今天讀不到 ` +
        `它標記為「dept:it」的資料——這正是 ADR 0012 裁定 4 要的效果:算太寬、靜默放行本該被 ` +
        `擋下的資料,那個洞已經補上。`,
    ).toBe(false);

    // 沒被 deny 的那把鑰匙不受影響——補 deny 不該連帶動到其他允許的鑰匙。
    expect(allow({ scopeKey: "group:general" })).toBe(true);
  });

  it("deny 一把不在允許清單裡的鑰匙,行為不變——deny 不會意外放寬", () => {
    // dept:finance 本來就沒被允許;deny 它理論上什麼都不該改變。
    const denied = ["dept:finance"];
    const scope = toRetrievalScope({
      principalId: "u-2",
      allowedScopeKeys: ["dept:it"],
      deniedScopeKeys: denied,
    });
    const allow = buildScopePredicate(scope);

    expect(allow({ scopeKey: "dept:it" })).toBe(true);
    expect(
      allow({ scopeKey: "dept:finance" }),
      `dept:finance 不在允許清單裡,即使明確 deny 了它,謂詞也已經拒絕它 ` +
        `(denied=[${denied.join(", ")}])。這條斷言記錄的是:deny 不該讓一個原本就被拒絕的鑰匙 ` +
        `變成「更被拒絕」以外的任何狀態——它是 phase-2b 實作完成後必須保持成立的底線。`,
    ).toBe(false);
  });

  it("空的 denied([])與今天完全相同——保證裁定 4 的呼叫端全傳 [] 是安全的", () => {
    const scope = toRetrievalScope({
      principalId: "u-3",
      allowedScopeKeys: ["dept:it", "group:general"],
      deniedScopeKeys: [],
    });
    // 工單裁定 4:deny 的來源(ACL 表)不在 2b,呼叫端此刻全部傳 []。
    const denied: readonly string[] = [];
    const allow = buildScopePredicate(scope);

    expect(
      allow({ scopeKey: "dept:it" }),
      `denied 是空陣列(denied=[${denied.join(", ")}]),不該擋下任何原本允許的鑰匙。` +
        `這條今天已經成立,是 phase-2b 加上 deniedScopeKeys 之後、所有呼叫端還沒接上 ACL 表之前, ` +
        `必須繼續成立的安全網——否則所有呼叫端會集體被鎖死。`,
    ).toBe(true);
    expect(allow({ scopeKey: "group:general" })).toBe(true);
  });

  it("SQL 層:被 deny 的鑰匙不會出現在 IN 清單裡——前置過濾,不是查完再濾", () => {
    const denied = ["dept:it"];
    const scope = toRetrievalScope({
      principalId: "u-4",
      allowedScopeKeys: ["dept:it", "group:general"],
      deniedScopeKeys: denied,
    });
    const { sql, params } = buildScopeSql(scope, "m.scope_key");

    expect(
      params.includes("dept:it"),
      `dept:it 已被明確拒絕(denied=[${denied.join(", ")}]),依 ADR 0012 裁定 3,denied 直接 ` +
        `不進 IN 清單(前置過濾,比「查完再濾」更接近「授權在檢索之前」)。buildScopeSql() 產生的 ` +
        `SQL 是「${sql}」、參數列表是 [${params.join(", ")}]——「dept:it」不在其中,代表被擋下的 ` +
        `部門的資料不會被送進資料庫查詢。裁定 3 同時要求保留既有的 post-assert(兩層都要)—— ` +
        `那一層(assertNoScopeLeak)也已經認得 denied,不在本檔的範圍(2b 只驗 predicate 與 SQL)。`,
    ).toBe(false);
  });
});
