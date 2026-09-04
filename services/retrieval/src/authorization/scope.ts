/**
 * Retrieval scoping — Deny-Wins, enforced before retrieval (鐵律 #2).
 *
 * Modelled on `services/conversation/src/repository/owner-scope.ts`, which
 * already gets this right for conversations: a branded type so "I forgot to
 * thread the scope through" is a compile error, plus a runtime check so a
 * cast cannot defeat it.
 *
 * THIS FILE MUST NEVER BE REPLACED BY A FAKE. Everything else in the skeleton
 * has a stub counterpart; this one does not, on purpose. It is the layer that
 * decides whether one department's maintenance records can surface in another
 * department's answer, and a stub here produces a permanently green light on
 * the single control the on-prem deployment is sold on.
 *
 * Two mechanisms, deliberately both:
 *
 *  - PRE-FILTER: the scope is pushed into the candidate query, so unauthorised
 *    chunks are never loaded into memory at all. "Authorization 先於
 *    retrieval" is a data-flow claim, not a UI claim — filtering after the
 *    fact still put the rows in the process.
 *  - POST-ASSERT: results are re-checked on the way out. A store that ignores
 *    the predicate (a bad index, a future ANN backend, a refactor) is caught
 *    here rather than in production.
 *
 * The pre-filter alone would be defeated by a store that silently drops the
 * predicate; the post-assert alone would mean unauthorised data had already
 * been read. Together they cover both ways this actually goes wrong.
 */

declare const scopeBrand: unique symbol;

/**
 * A validated retrieval scope. Only `toRetrievalScope` can produce one, so a
 * plain object cannot be passed where a scope is required.
 */
export type RetrievalScope = {
  readonly principalId: string;
  /** Department/group keys the principal may read. Empty = deny everything. */
  readonly allowedScopeKeys: readonly string[];
  /**
   * Explicit ACL denials (ADR 0012 裁定 4) — Deny-Wins overrides a grant in
   * `allowedScopeKeys` rather than merely narrowing it. Always present on a
   * constructed scope (never `undefined`): every reader can rely on this
   * field existing without an `?? []` guard. The ACL table that will supply
   * real values is not built yet (left to phase-3 / I3) — every caller today
   * passes `[]`, which is a no-op alongside `allowedScopeKeys`.
   */
  readonly deniedScopeKeys: readonly string[];
} & { readonly [scopeBrand]: true };

export class RetrievalScopeError extends Error {
  override readonly name = "RetrievalScopeError";
}

/**
 * Fail-closed constructor.
 *
 * An empty `allowedScopeKeys` is ACCEPTED and means "this principal may read
 * nothing" — that is a legitimate state (a new user, a revoked account) and it
 * must deny rather than throw. What is rejected is a MISSING or malformed
 * scope, because that means the caller forgot to thread authorization through,
 * and silently treating that as "deny all" would hide the bug until someone
 * "fixed" it by widening the scope.
 */
export function toRetrievalScope(input: {
  principalId: string;
  allowedScopeKeys: readonly string[];
  /**
   * ADR 0012 裁定 4:必填、無預設——讓 typecheck 釘住每個呼叫端
   * (E06-S026 的教訓:「還沒想過」與「想過了答案是零」不等價,可選欄位會讓
   * 前者被靜默當成後者)。第二輪(開發 agent)曾把它做成 optional,因為當時
   * `*.test.ts` 與 `features/steps/**` 裡有 30+ 處呼叫端還沒接上這個欄位,
   * 那兩類是開發 agent 不能改的檔;第三輪(測試 agent)已經把那些呼叫端全部
   * 補上 `deniedScopeKeys: []`,這一輪(開發 agent)照字面把它改回必填。
   */
  deniedScopeKeys: readonly string[];
}): RetrievalScope {
  if (typeof input?.principalId !== "string" || input.principalId.trim() === "") {
    throw new RetrievalScopeError(
      "principalId 不得為空。這是 fail-closed 守門,不是格式規則:沒有 principal 的檢索無法判斷授權範圍。",
    );
  }
  if (!Array.isArray(input.allowedScopeKeys)) {
    throw new RetrievalScopeError(
      "allowedScopeKeys 必須是陣列。缺少範圍代表呼叫端沒有把授權接進來,不可視為 deny-all 而靜默通過。",
    );
  }
  for (const key of input.allowedScopeKeys) {
    if (typeof key !== "string" || key.trim() === "") {
      throw new RetrievalScopeError(`allowedScopeKeys 含有空白或非字串項目:${JSON.stringify(key)}`);
    }
  }
  if (!Array.isArray(input.deniedScopeKeys)) {
    throw new RetrievalScopeError(
      "deniedScopeKeys 必須是陣列。缺少這份清單代表呼叫端沒有把 deny 接進來," +
        "不可靜默視為「沒有任何 deny」而通過——想清楚答案是空陣列的呼叫端請明寫 []。",
    );
  }
  for (const key of input.deniedScopeKeys) {
    if (typeof key !== "string" || key.trim() === "") {
      throw new RetrievalScopeError(`deniedScopeKeys 含有空白或非字串項目:${JSON.stringify(key)}`);
    }
  }

  return {
    principalId: input.principalId,
    allowedScopeKeys: Object.freeze([...input.allowedScopeKeys]),
    deniedScopeKeys: Object.freeze([...input.deniedScopeKeys]),
  } as RetrievalScope;
}

/** Anything retrievable carries the scope key it belongs to. */
export interface ScopedRecord {
  readonly scopeKey: string;
}

/**
 * The pre-filter predicate. Pass this INTO the store so unauthorised rows are
 * never materialised. Deny-Wins: absence of an explicit allow is a deny.
 */
export function buildScopePredicate(scope: RetrievalScope): (record: ScopedRecord) => boolean {
  const allowed = new Set(scope.allowedScopeKeys);
  const denied = new Set(scope.deniedScopeKeys);
  return (record) => {
    if (typeof record?.scopeKey !== "string" || record.scopeKey.trim() === "") return false;
    return allowed.has(record.scopeKey) && !denied.has(record.scopeKey);
  };
}

/**
 * SQL fragment + parameters for stores that filter in the database.
 *
 * Returns a predicate that is always false when the principal may read
 * nothing, rather than an empty `IN ()` — which is a syntax error in SQLite
 * and, worse, is sometimes "helpfully" omitted by query builders, turning
 * deny-all into allow-all.
 */
export function buildScopeSql(
  scope: RetrievalScope,
  column = "scope_key",
): { readonly sql: string; readonly params: readonly string[] } {
  const denied = new Set(scope.deniedScopeKeys);
  // Pre-filter: a denied key never reaches the IN list at all (ADR 0012 裁定
  // 3) — closer to "authorization before retrieval" than filtering rows out
  // after the query runs.
  const effectiveKeys = scope.allowedScopeKeys.filter((key) => !denied.has(key));
  if (effectiveKeys.length === 0) {
    return { sql: "1 = 0", params: [] };
  }
  const placeholders = effectiveKeys.map(() => "?").join(", ");
  return {
    sql: `${column} IN (${placeholders})`,
    params: [...effectiveKeys],
  };
}

export class ScopeLeakError extends Error {
  override readonly name = "ScopeLeakError";
}

/**
 * Defence in depth. Call on every result set leaving the retrieval layer.
 *
 * Throws rather than filtering, because a leak here means the pre-filter did
 * not run — silently correcting it would leave the real defect in place and
 * the next backend would leak again.
 */
export function assertNoScopeLeak<T extends ScopedRecord>(
  scope: RetrievalScope,
  records: readonly T[],
): readonly T[] {
  const allowed = new Set(scope.allowedScopeKeys);
  const denied = new Set(scope.deniedScopeKeys);
  const leaked = records.filter((r) => !allowed.has(r?.scopeKey) || denied.has(r?.scopeKey));
  if (leaked.length > 0) {
    const keys = [...new Set(leaked.map((r) => String(r?.scopeKey)))].join(", ");
    throw new ScopeLeakError(
      `檢索結果含有 ${leaked.length} 筆超出授權範圍的資料(scopeKey: ${keys})。` +
        `這代表前置過濾未生效——未授權資料已經進入 process。不要在此處改為過濾掉,` +
        `要去修前置過濾;此檢查是最後一道防線,不是主要機制。`,
    );
  }
  return records;
}
