import { describe, expect, it } from "vitest";
import { listRoles } from "./roles";
import { ALL_ROLES } from "./users";

describe("listRoles (E11-S006)", () => {
  it("returns every system role, in the same order ALL_ROLES defines", async () => {
    const result = await listRoles();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((summary) => summary.role)).toEqual(ALL_ROLES);
  });

  it("every role has a non-empty description", async () => {
    const result = await listRoles();
    if (!result.ok) throw new Error("expected ok");

    for (const summary of result.value) {
      expect(summary.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses the real SOURCE_BASELINE §7 responsibility text, not placeholder content", async () => {
    const result = await listRoles();
    if (!result.ok) throw new Error("expected ok");

    const byRole = Object.fromEntries(result.value.map((summary) => [summary.role, summary.description]));
    expect(byRole.general_user).toBe("一般企業員工。");
    expect(byRole.super_administrator).toBe("最高系統權限。");
    expect(byRole.auditor).toContain("Audit");
    expect(byRole.it_administrator).toContain("Account");
  });

  it("every role in ALL_ROLES has exactly one corresponding entry, no duplicates or omissions", async () => {
    const result = await listRoles();
    if (!result.ok) throw new Error("expected ok");

    expect(result.value.length).toBe(ALL_ROLES.length);
    expect(new Set(result.value.map((summary) => summary.role)).size).toBe(ALL_ROLES.length);
  });
});
