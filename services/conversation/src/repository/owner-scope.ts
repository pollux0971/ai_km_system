/**
 * Owner scoping (E04-S040 AC7, DEVELOPMENT_POLICY §2/§3).
 *
 * Deny-Wins has to be enforced where the data actually lives, not only in a
 * route guard. Two mechanisms, deliberately both:
 *
 *  - a BRANDED type, so a plain `string` cannot be passed where an owner key
 *    is required and "I forgot to thread the owner through" is a compile
 *    error rather than a query that returns everyone's rows;
 *  - a RUNTIME check on the SQL itself, so a statement that forgot its
 *    `owner_key` predicate cannot even be prepared.
 *
 * The type check alone would be defeated by a cast; the SQL check alone would
 * be defeated by passing the wrong owner. Together they cover the two ways
 * this actually goes wrong.
 */
import type { Database, Statement } from "better-sqlite3";

declare const ownerKeyBrand: unique symbol;

/** A validated owner key. Only `toOwnerKey` can produce one. */
export type OwnerKey = string & { readonly [ownerKeyBrand]: true };

export class OwnerScopeError extends Error {
  override readonly name = "OwnerScopeError";
}

export function toOwnerKey(value: string): OwnerKey {
  if (typeof value !== "string" || value.trim() === "") {
    throw new OwnerScopeError(
      "owner key 不得為空。這是 fail-closed 守門,不是格式規則:沒有 owner 的查詢會跨使用者回傳資料。",
    );
  }
  return value as OwnerKey;
}

/**
 * Strips string literals and comments before looking for the predicate, so
 * `where v = 'owner_key'` cannot satisfy the guard.
 */
function stripLiteralsAndComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, " ")
    .replace(/"(?:[^"]|"")*"/g, " ");
}

/**
 * Prepares a statement, refusing any read or write that is not scoped to an
 * owner.
 *
 * Reads/updates/deletes must mention `owner_key` in a predicate; inserts must
 * supply it as a column. A statement that legitimately needs no scoping (DDL,
 * a migration) does not belong in a repository and should use `db.prepare`
 * directly with a comment saying why.
 */
export function prepareOwnerScoped(db: Database, sql: string): Statement {
  const bare = stripLiteralsAndComments(sql).toLowerCase();

  if (!bare.includes("owner_key")) {
    throw new OwnerScopeError(
      `這段 SQL 沒有 owner_key,會跨使用者存取資料,已拒絕 prepare:\n  ${sql.trim()}`,
    );
  }

  const isInsert = /^\s*insert\s/i.test(bare);
  if (isInsert) {
    const columns = bare.slice(bare.indexOf("("), bare.indexOf(")") + 1);
    if (!columns.includes("owner_key")) {
      throw new OwnerScopeError(
        `INSERT 沒有寫入 owner_key 欄位,會產生無主資料列,已拒絕 prepare:\n  ${sql.trim()}`,
      );
    }
    return db.prepare(sql);
  }

  // For everything else `owner_key` must appear after the WHERE, not merely
  // in the select list or a join target.
  const whereIndex = bare.indexOf("where");
  if (whereIndex === -1 || !bare.slice(whereIndex).includes("owner_key")) {
    throw new OwnerScopeError(
      `這段 SQL 的 WHERE 條件沒有 owner_key,會跨使用者存取資料,已拒絕 prepare:\n  ${sql.trim()}`,
    );
  }

  return db.prepare(sql);
}
