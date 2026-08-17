import { describe, expect, it } from "vitest";
import { ALL_CAPABILITIES, listPermissionMatrix } from "./permission-matrix";
import { ALL_ROLES } from "./users";

describe("listPermissionMatrix (E11-S008)", () => {
  it("returns every system role, in the same order ALL_ROLES defines", async () => {
    const result = await listPermissionMatrix();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((row) => row.role)).toEqual(ALL_ROLES);
  });

  it("gives each non-admin role exactly the capabilities SOURCE_BASELINE §7 lists for it", async () => {
    const result = await listPermissionMatrix();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byRole = Object.fromEntries(result.value.map((row) => [row.role, row.capabilities]));

    expect(byRole.general_user).toEqual([]);
    expect(byRole.department_manager).toEqual(["部門 KB", "部門使用者", "部門 Knowledge"]);
    expect(byRole.knowledge_manager).toEqual(["Knowledge", "Document", "FAQ", "Feedback", "Knowledge Quality"]);
    expect(byRole.maintenance_engineer).toEqual(["Maintenance Assistant", "SOP", "Error Code", "Troubleshooting"]);
    expect(byRole.sales_purchasing).toEqual(["ERP Assistant", "Data Query", "Excel"]);
    expect(byRole.it_administrator).toEqual(["Account", "SSO", "Connector", "System"]);
    expect(byRole.ai_administrator).toEqual(["Model", "Prompt", "Evaluation", "RAG"]);
    expect(byRole.auditor).toEqual(["Audit", "Security Event"]);
  });

  it("gives super_administrator every capability every other role has, matching its baseline description of 最高系統權限", async () => {
    const result = await listPermissionMatrix();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byRole = Object.fromEntries(result.value.map((row) => [row.role, row.capabilities]));
    const superAdminCapabilities = new Set(byRole.super_administrator);

    for (const row of result.value) {
      if (row.role === "super_administrator") continue;
      for (const capability of row.capabilities) {
        expect(superAdminCapabilities.has(capability)).toBe(true);
      }
    }
  });

  it("ALL_CAPABILITIES has no duplicate entries", () => {
    expect(new Set(ALL_CAPABILITIES).size).toBe(ALL_CAPABILITIES.length);
  });

  it("every non-admin role's capabilities are a subset of ALL_CAPABILITIES", async () => {
    const result = await listPermissionMatrix();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const row of result.value) {
      for (const capability of row.capabilities) {
        expect(ALL_CAPABILITIES).toContain(capability);
      }
    }
  });
});
