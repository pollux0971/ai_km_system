import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadContracts, resolveContractsDir } from "./contracts.js";

const FIXTURES = path.dirname(fileURLToPath(import.meta.url)) + "/testing/fixtures";

describe("contract loader (E04-S039)", () => {
  it("loads every .yaml in the directory and exposes them by name", async () => {
    const reg = await loadContracts(FIXTURES);
    expect(reg.specNames()).toContain("sample");
  });

  it("hands back a request schema a route can bind to", async () => {
    const reg = await loadContracts(FIXTURES);
    const schema = reg.getSchema("sample", "CreateWidgetRequest");
    expect(schema).toMatchObject({ type: "object", required: ["name"] });
  });

  it("throws a named error for an unknown spec or schema rather than returning undefined", async () => {
    const reg = await loadContracts(FIXTURES);
    expect(() => reg.getSchema("nope", "CreateWidgetRequest")).toThrow(/nope/);
    expect(() => reg.getSchema("sample", "NoSuchSchema")).toThrow(/NoSuchSchema/);
  });

  it("dereferences $ref so a bound schema needs no runtime resolution", async () => {
    const reg = await loadContracts(FIXTURES);
    const res = reg.getResponseSchema("sample", "/widgets", "post", 201);
    // A live $ref would leave { $ref: "..." } instead of the resolved object.
    expect(res).toMatchObject({ type: "object", required: ["id", "name"] });
    expect(JSON.stringify(res)).not.toContain("$ref");
  });

  it("validates a conforming response body", async () => {
    const reg = await loadContracts(FIXTURES);
    const r = reg.validateResponse("sample", "/widgets", "post", 201, {
      id: "8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77",
      name: "widget",
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("reports the missing property by name when a response body does not conform", async () => {
    const reg = await loadContracts(FIXTURES);
    const r = reg.validateResponse("sample", "/widgets", "post", 201, { name: "widget" });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toContain("id");
  });

  it("rejects an unexpected extra property (additionalProperties: false is enforced)", async () => {
    const reg = await loadContracts(FIXTURES);
    const r = reg.validateResponse("sample", "/widgets", "post", 201, {
      id: "8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77",
      name: "widget",
      sneaky: true,
    });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toContain("sneaky");
  });

  it("enforces `format` (a bad uuid is not silently accepted)", async () => {
    const reg = await loadContracts(FIXTURES);
    const r = reg.validateResponse("sample", "/widgets", "post", 201, { id: "nope", name: "w" });
    expect(r.valid).toBe(false);
  });

  it("finds the repo's real contracts directory by walking up from the module", () => {
    const dir = resolveContractsDir();
    expect(dir.endsWith(path.join("contracts", "openapi"))).toBe(true);
  });

  it("loads the real repo contracts, including cross-file $ref into core.yaml", async () => {
    // E04-S038 is a SOFT dependency: if conversations.yaml has not landed this
    // asserts nothing about it, but core.yaml has existed since the scaffold.
    const reg = await loadContracts(resolveContractsDir());
    expect(reg.specNames()).toContain("core");
    if (reg.specNames().includes("conversations")) {
      const conv = reg.getSchema("conversations", "Conversation");
      expect(conv).toMatchObject({ type: "object" });
      // The Error $ref crosses into core.yaml — proves external refs resolve.
      const err = reg.getSchema("conversations", "NotFoundErrorBody");
      expect(JSON.stringify(err)).not.toContain("$ref");
      expect(JSON.stringify(err)).toContain("message");
    }
  });
});
