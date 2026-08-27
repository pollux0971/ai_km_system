import { fileURLToPath } from "node:url";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadContracts, type ContractRegistry } from "../contracts.js";
import { expectResponseMatchesContract } from "./contract.js";

const FIXTURES = path.dirname(fileURLToPath(import.meta.url)) + "/fixtures";

let registry: ContractRegistry;
beforeAll(async () => {
  registry = await loadContracts(FIXTURES);
});

const OK = { id: "8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77", name: "widget" };

describe("expectResponseMatchesContract (AC7 — the harness tests itself)", () => {
  it("passes a conforming body silently", () => {
    expect(() =>
      expectResponseMatchesContract("sample", "/widgets", "post", 201, OK, registry),
    ).not.toThrow();
  });

  it("throws naming the missing field when a required property is absent", () => {
    expect(() =>
      expectResponseMatchesContract("sample", "/widgets", "post", 201, { name: "w" }, registry),
    ).toThrow(/id/);
  });

  it("throws naming the offending field when an extra property appears", () => {
    expect(() =>
      expectResponseMatchesContract(
        "sample",
        "/widgets",
        "post",
        201,
        { ...OK, undeclared: 1 },
        registry,
      ),
    ).toThrow(/undeclared/);
  });

  it("throws when a declared format is violated", () => {
    expect(() =>
      expectResponseMatchesContract("sample", "/widgets", "post", 201, { ...OK, id: "x" }, registry),
    ).toThrow();
  });

  it("throws when a declared type is violated", () => {
    expect(() =>
      expectResponseMatchesContract(
        "sample",
        "/widgets",
        "post",
        201,
        { ...OK, size: "three" },
        registry,
      ),
    ).toThrow(/size/);
  });

  it("throws — rather than silently passing — for a status the contract never declares", () => {
    expect(() =>
      expectResponseMatchesContract("sample", "/widgets", "post", 418, OK, registry),
    ).toThrow(/418/);
  });

  it("throws for a path the contract never declares", () => {
    expect(() =>
      expectResponseMatchesContract("sample", "/nope", "post", 201, OK, registry),
    ).toThrow(/nope/);
  });

  it("names the spec, path, method and status in the failure, so a red gate is actionable", () => {
    let message = "";
    try {
      expectResponseMatchesContract("sample", "/widgets", "post", 201, { name: "w" }, registry);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("sample");
    expect(message).toContain("/widgets");
    expect(message).toContain("post");
    expect(message).toContain("201");
  });
});
