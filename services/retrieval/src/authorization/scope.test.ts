import { describe, expect, it } from "vitest";
import {
  assertNoScopeLeak,
  buildScopePredicate,
  buildScopeSql,
  RetrievalScopeError,
  ScopeLeakError,
  toRetrievalScope,
} from "./scope.js";

const scope = toRetrievalScope({
  principalId: "u-1",
  allowedScopeKeys: ["dept:maintenance", "dept:ops"],
});

describe("RetrievalScope — Deny-Wins", () => {
  it("PF0 空的 principalId 必須拒絕——代表授權沒被接進來", () => {
    expect(() => toRetrievalScope({ principalId: "", allowedScopeKeys: [] })).toThrow(
      RetrievalScopeError,
    );
  });

  it("PF0 空的 allowedScopeKeys 是合法狀態,意義為拒絕全部", () => {
    const none = toRetrievalScope({ principalId: "u-new", allowedScopeKeys: [] });
    const allow = buildScopePredicate(none);
    expect(allow({ scopeKey: "dept:maintenance" })).toBe(false);
  });

  it("PF0 未列出的範圍一律拒絕", () => {
    const allow = buildScopePredicate(scope);
    expect(allow({ scopeKey: "dept:maintenance" })).toBe(true);
    expect(allow({ scopeKey: "dept:finance" })).toBe(false);
  });

  it("PF0 缺少 scopeKey 的資料一律拒絕,而非視為公開", () => {
    const allow = buildScopePredicate(scope);
    expect(allow({ scopeKey: "" })).toBe(false);
    expect(allow({} as { scopeKey: string })).toBe(false);
  });

  it("PF0 零授權時產生 1 = 0,不得產生空的 IN ()", () => {
    const none = toRetrievalScope({ principalId: "u-new", allowedScopeKeys: [] });
    const { sql, params } = buildScopeSql(none);
    expect(sql).toBe("1 = 0");
    expect(params).toEqual([]);
    expect(sql).not.toContain("IN ()");
  });

  it("PF0 SQL 使用參數佔位,不做字串拼接", () => {
    const { sql, params } = buildScopeSql(scope, "m.scope_key");
    expect(sql).toBe("m.scope_key IN (?, ?)");
    expect(params).toEqual(["dept:maintenance", "dept:ops"]);
  });

  it("PF0 洩漏偵測拋錯而非靜默過濾——靜默過濾會留下真正的缺陷", () => {
    expect(() =>
      assertNoScopeLeak(scope, [{ scopeKey: "dept:finance" }]),
    ).toThrow(ScopeLeakError);
  });

  it("PF0 全部合規時原樣回傳", () => {
    const rows = [{ scopeKey: "dept:ops" }];
    expect(assertNoScopeLeak(scope, rows)).toBe(rows);
  });
});
