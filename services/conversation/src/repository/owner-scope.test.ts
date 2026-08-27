import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { OwnerScopeError, prepareOwnerScoped, toOwnerKey } from "./owner-scope.js";

function db(): Database.Database {
  const database = new Database(":memory:");
  database.exec("create table t (id text primary key, owner_key text not null, v text)");
  return database;
}

describe("toOwnerKey (E04-S040 AC7 — runtime half)", () => {
  it("accepts a real key", () => {
    expect(String(toOwnerKey("user-1"))).toBe("user-1");
  });

  it.each([["", "empty"], ["   ", "whitespace"]])("rejects a %s key (%s)", (value) => {
    expect(() => toOwnerKey(value)).toThrow(OwnerScopeError);
  });

  it.each([[null], [undefined], [0], [{}]])("rejects the non-string %s", (value) => {
    expect(() => toOwnerKey(value as unknown as string)).toThrow(OwnerScopeError);
  });

  it("explains that this is a fail-closed guard, not a formatting rule", () => {
    expect(() => toOwnerKey("")).toThrow(/owner/i);
  });
});

describe("prepareOwnerScoped (E04-S040 AC7 — the query guard)", () => {
  it("prepares a statement that filters by owner_key", () => {
    const d = db();
    const stmt = prepareOwnerScoped(d, "select id from t where owner_key = ?");
    expect(stmt.all(toOwnerKey("o1"))).toEqual([]);
  });

  it("REFUSES a select with no owner_key predicate — the whole point of the helper", () => {
    const d = db();
    expect(() => prepareOwnerScoped(d, "select id from t")).toThrow(OwnerScopeError);
  });

  it("refuses a delete with no owner_key predicate", () => {
    const d = db();
    expect(() => prepareOwnerScoped(d, "delete from t where id = ?")).toThrow(OwnerScopeError);
  });

  it("refuses an update with no owner_key predicate", () => {
    const d = db();
    expect(() => prepareOwnerScoped(d, "update t set v = ? where id = ?")).toThrow(OwnerScopeError);
  });

  it("accepts an insert that supplies owner_key as a column", () => {
    const d = db();
    expect(() =>
      prepareOwnerScoped(d, "insert into t (id, owner_key, v) values (?, ?, ?)"),
    ).not.toThrow();
  });

  it("refuses an insert that omits owner_key", () => {
    const d = db();
    expect(() => prepareOwnerScoped(d, "insert into t (id, v) values (?, ?)")).toThrow(
      OwnerScopeError,
    );
  });

  it("is not fooled by owner_key appearing only inside a string literal or comment", () => {
    const d = db();
    expect(() => prepareOwnerScoped(d, "select id from t where v = 'owner_key'")).toThrow(
      OwnerScopeError,
    );
    expect(() => prepareOwnerScoped(d, "select id from t -- owner_key")).toThrow(OwnerScopeError);
  });

  it("names the offending SQL so the failure is actionable", () => {
    const d = db();
    let message = "";
    try {
      prepareOwnerScoped(d, "select id from t");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("owner_key");
  });
});
