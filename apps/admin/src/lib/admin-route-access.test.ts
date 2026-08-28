import { describe, expect, it } from "vitest";
import { rolesRequiredForAdminRoute } from "./admin-route-access";

describe("rolesRequiredForAdminRoute (E11-S023)", () => {
  it("requires it_administrator or super_administrator for /users, not ai_administrator", () => {
    const roles = rolesRequiredForAdminRoute("/users");

    expect(roles).toEqual(["it_administrator", "super_administrator"]);
  });

  it("resolves a nested route (/users/[id]) to the same requirement as its parent /users", () => {
    expect(rolesRequiredForAdminRoute("/users/mock-user-it-admin")).toEqual(["it_administrator", "super_administrator"]);
    expect(rolesRequiredForAdminRoute("/users/new")).toEqual(["it_administrator", "super_administrator"]);
  });

  it("requires super_administrator only for /roles — RBAC structure itself, not delegated to a domain admin", () => {
    expect(rolesRequiredForAdminRoute("/roles")).toEqual(["super_administrator"]);
  });

  it("requires knowledge_manager or super_administrator for /knowledge, distinct from /models's requirement", () => {
    expect(rolesRequiredForAdminRoute("/knowledge")).toEqual(["knowledge_manager", "super_administrator"]);
    expect(rolesRequiredForAdminRoute("/models")).toEqual(["ai_administrator", "super_administrator"]);
  });

  it("requires auditor or super_administrator for /audit", () => {
    expect(rolesRequiredForAdminRoute("/audit")).toEqual(["auditor", "super_administrator"]);
  });

  it("requires super_administrator only for /latency (E11-S026: was missing from the table entirely, a pre-existing gap this story surfaced)", () => {
    expect(rolesRequiredForAdminRoute("/latency")).toEqual(["super_administrator"]);
  });

  it("returns undefined for a route not in the table — fail-closed default, not silently open", () => {
    expect(rolesRequiredForAdminRoute("/this-route-does-not-exist")).toBeUndefined();
  });

  it("does not match an unrelated sibling route by prefix (/document-failures vs /document-failures-report)", () => {
    expect(rolesRequiredForAdminRoute("/document-failures-report")).toBeUndefined();
  });
});
