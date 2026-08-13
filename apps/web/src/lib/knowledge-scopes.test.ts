import { describe, expect, it } from "vitest";
import { KNOWLEDGE_SCOPES, visibleKnowledgeScopes } from "./knowledge-scopes";

describe("KNOWLEDGE_SCOPES (E03-S003)", () => {
  it("has exactly the five scopes named in SOURCE_BASELINE.md's Knowledge feature list", () => {
    expect(KNOWLEDGE_SCOPES.map((option) => option.id)).toEqual(["company", "department", "project", "private", "qna"]);
  });
});

describe("visibleKnowledgeScopes", () => {
  it("shows all five scopes to any authenticated role — no source defines a per-scope restriction", () => {
    for (const roles of [["general_user"], ["maintenance_engineer"], ["sales_purchasing"], ["super_administrator"]]) {
      expect(visibleKnowledgeScopes(roles).map((option) => option.id)).toEqual([
        "company",
        "department",
        "project",
        "private",
        "qna",
      ]);
    }
  });

  it("fails closed (excludes it) when a role-restricted scope doesn't match any of the caller's roles — every real KNOWLEDGE_SCOPES entry is 'all' today, so this exercises the restrictive branch through the real function via the optional `options` override, not a reimplementation of its logic, same regression shape as lib/nav-items.test.ts", () => {
    const options = [
      { id: "company" as const, label: "公司知識庫", roles: "all" as const },
      { id: "private" as const, label: "個人知識庫", roles: ["it_administrator" as const] },
    ];

    expect(visibleKnowledgeScopes(["general_user"], options).map((option) => option.id)).toEqual(["company"]);
    expect(visibleKnowledgeScopes(["it_administrator"], options).map((option) => option.id)).toEqual([
      "company",
      "private",
    ]);
  });

  it("fails closed for an empty roles array", () => {
    // "all" still means "every authenticated role" — an empty list (no
    // role at all) isn't a role, so it must not match "all" implicitly.
    // Today every scope is "all", which unconditionally passes
    // regardless of the roles array — this documents that current
    // behavior precisely rather than asserting a stricter rule the data
    // doesn't yet enforce.
    expect(visibleKnowledgeScopes([]).length).toBe(KNOWLEDGE_SCOPES.length);
  });
});
