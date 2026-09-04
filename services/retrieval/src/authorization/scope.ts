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
   * ADR 0012 裁定 4 的原意是「必填、無預設」,讓 typecheck 釘住每個呼叫端
   * (E06-S026 的教訓:可選就會被靜默略過)。這裡沒有照字面做成必填——`?`
   * 是刻意的、有記錄的偏離,不是漏改:`toRetrievalScope()` 今天被十幾個
   * `*.test.ts` 與 `features/steps/**` 呼叫(見下方 CALLERS),這兩類是
   * GHERKIN_WORKFLOW §6 明訂「開發 agent 不改」的檔案。把這個欄位設成必填
   * 會讓那些呼叫端全數在 `pnpm typecheck` 炸掉——不是「少改幾個檔」的偷懶,
   * 是字面上不存在合規的做法。所以退而求其次:輸入允許省略、省略時視為
   * `[]`(語意上等於「這個呼叫端還沒接上 deny」,不是「這個人被拒絕一切」,
   * 兩者不衝突);但輸出的 `RetrievalScope.deniedScopeKeys` 保持非 optional、
   * 一律有值,讀者不需要 `?? []`。真正的「明寫 []」約束落在本檔案能改的
   * 呼叫端上(見 `tools/w1-00-demo/run.ts`)。詳情見本輪回報。
   *
   * CALLERS without this field today (unedited by this change): every
   * `*.test.ts` under `services/retrieval|generation|ingestion` that builds
   * a scope, plus `features/steps/authorization|retrieval|integration|
   * ingestion.steps.ts`. Two of `deny.test.ts`'s four assertions and two of
   * `phase-2.feature`'s deny scenarios stay red because of this — their own
   * `Given`/`When` steps capture a `denied` value locally but never pass it
   * here, so no scope.ts implementation can make them pass without also
   * editing those files.
   */
  deniedScopeKeys?: readonly string[];
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
  const deniedScopeKeys = input.deniedScopeKeys ?? [];
  if (!Array.isArray(deniedScopeKeys)) {
    throw new RetrievalScopeError(
      "deniedScopeKeys 必須是陣列。省略時視為 [],但傳了非陣列的值代表呼叫端狀態有誤,不可靜默吞掉。",
    );
  }
  for (const key of deniedScopeKeys) {
    if (typeof key !== "string" || key.trim() === "") {
      throw new RetrievalScopeError(`deniedScopeKeys 含有空白或非字串項目:${JSON.stringify(key)}`);
    }
  }

  return {
    principalId: input.principalId,
    allowedScopeKeys: Object.freeze([...input.allowedScopeKeys]),
    deniedScopeKeys: Object.freeze([...deniedScopeKeys]),
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
