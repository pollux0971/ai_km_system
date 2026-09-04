import { describe, expect, it } from "vitest";
import { buildScopePredicate, buildScopeSql, toRetrievalScope } from "./scope.js";

/**
 * phase-2b(紅,2026-09-04)—— ADR 0012 對 E04-S009 剩下那題(顯式 ACL deny
 * 蓋過 allow)的完整形狀裁定。細節見 features/02-authorization/phase-2.feature
 * 開頭與 FEATURE.md「phase-2b 提案」段。
 *
 * `RetrievalScope` 今天只有 `allowedScopeKeys` 一個欄位,`toRetrievalScope()` 的
 * 輸入型別是 `{ principalId: string; allowedScopeKeys: readonly string[] }`,
 * 不多不少。這裡刻意不把 denied 清單傳給它——那樣會撞 TypeScript 的 excess
 * property check,紅在編譯而非行為(見工單「關鍵技巧」段)。denied 清單留在
 * 測試自己的變數裡,拿現有的 buildScopePredicate / buildScopeSql 對著它斷言
 * 「本該被擋下的東西沒被擋下」——這是行為缺口,不是型別缺口,`pnpm typecheck` /
 * `pnpm lint` 應維持綠。
 */
describe("RetrievalScope — 裁定 4:顯式 ACL deny 蓋過 allow(phase-2b,紅)", () => {
  it("允許清單裡的鑰匙一旦被明確 deny,今天的謂詞仍然放行——這正是要補的洞", () => {
    const scope = toRetrievalScope({
      principalId: "u-1",
      allowedScopeKeys: ["dept:it", "group:general"],
    });
    // 顧問裁定 4:即使在允許清單裡,denied 仍要擋下。今天的型別沒有欄位可以
    // 承接這份清單,所以它只活在這個測試變數裡,從未真正餵進 toRetrievalScope()。
    const denied = ["dept:it"];
    const allow = buildScopePredicate(scope);

    expect(
      allow({ scopeKey: "dept:it" }),
      `dept:it 同時在允許清單與明確拒絕清單(denied=[${denied.join(", ")}])裡,依 Deny-Wins ` +
        `應該被拒絕,但 buildScopePredicate() 今天只看 allowedScopeKeys,不認得 denied,所以判定為放行 ` +
        `——一個被明確擋下的部門,今天仍然讀得到它標記為「dept:it」的資料。這正是 ADR 0012 裁定 4 要補的洞: ` +
        `算太寬,靜默放行了本該被擋下的資料。`,
    ).toBe(false);

    // 沒被 deny 的那把鑰匙不受影響——這條今天已經是綠的,留著當對照,證明
    // 「補 deny」不該連帶動到其他允許的鑰匙。
    expect(allow({ scopeKey: "group:general" })).toBe(true);
  });

  it("deny 一把不在允許清單裡的鑰匙,行為不變——deny 不會意外放寬", () => {
    const scope = toRetrievalScope({ principalId: "u-2", allowedScopeKeys: ["dept:it"] });
    // dept:finance 本來就沒被允許;deny 它理論上什麼都不該改變。
    const denied = ["dept:finance"];
    const allow = buildScopePredicate(scope);

    expect(allow({ scopeKey: "dept:it" })).toBe(true);
    expect(
      allow({ scopeKey: "dept:finance" }),
      `dept:finance 不在允許清單裡,即使還沒有任何 deny 機制,今天的謂詞也已經拒絕它 ` +
        `(denied=[${denied.join(", ")}] 在這裡純屬描述性,還沒有任何程式碼路徑讀取它)。` +
        `這條斷言記錄的是:deny 不該讓一個原本就被拒絕的鑰匙變成「更被拒絕」以外的任何狀態—— ` +
        `它已經滿足,是 phase-2b 實作完成後仍必須保持成立的底線,不是本回合要補的洞。`,
    ).toBe(false);
  });

  it("空的 denied([])與今天完全相同——保證裁定 4 的呼叫端全傳 [] 是安全的", () => {
    const scope = toRetrievalScope({
      principalId: "u-3",
      allowedScopeKeys: ["dept:it", "group:general"],
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

  it("SQL 層:被 deny 的鑰匙今天仍然出現在 IN 清單裡——不是前置過濾,是完全沒過濾", () => {
    const scope = toRetrievalScope({
      principalId: "u-4",
      allowedScopeKeys: ["dept:it", "group:general"],
    });
    const denied = ["dept:it"];
    const { sql, params } = buildScopeSql(scope, "m.scope_key");

    expect(
      params.includes("dept:it"),
      `dept:it 已被明確拒絕(denied=[${denied.join(", ")}]),依 ADR 0012 裁定 3,denied 應該直接 ` +
        `不進 IN 清單(前置過濾,比「查完再濾」更接近「授權在檢索之前」)。但 buildScopeSql() 今天 ` +
        `只讀 allowedScopeKeys,產生的 SQL 是「${sql}」、參數列表是 [${params.join(", ")}]—— ` +
        `「dept:it」仍在其中,代表被擋下的部門的資料仍然會被送進資料庫查詢、讀回 process—— ` +
        `裁定 3 同時要求保留既有的 post-assert(兩層都要),但那一層(assertNoScopeLeak)今天 ` +
        `一樣只認得 allowedScopeKeys,同樣接不住 denied,不在本檔的範圍(2b 只驗 predicate 與 SQL)。`,
    ).toBe(false);
  });
});
