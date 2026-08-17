import { beforeEach, describe, expect, it } from "vitest";
import { getRole, listRoles, updateRoleDescription } from "./roles";
import { ALL_ROLES } from "./users";

// E11-S007 introduces sessionStorage-backed persistence for edited
// descriptions — same reset-between-tests precedent users.test.ts's own
// beforeEach already establishes.
beforeEach(() => {
  window.sessionStorage.clear();
});

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

describe("getRole (E11-S007)", () => {
  it("returns the matching role summary for a known role", async () => {
    const result = await getRole("auditor");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ role: "auditor", description: "查看 Audit、Security Event。" });
  });

  it("returns null (not an error) for a string that isn't a real role", async () => {
    const result = await getRole("not-a-real-role");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });
});

describe("updateRoleDescription (E11-S007)", () => {
  it("updates the description and persists it across a subsequent getRole() call", async () => {
    const result = await updateRoleDescription("general_user", "更新後的說明。");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ role: "general_user", description: "更新後的說明。" });

    const fetched = await getRole("general_user");
    if (!fetched.ok) throw new Error("expected ok");
    expect(fetched.value?.description).toBe("更新後的說明。");
  });

  it("the updated description is also reflected in a subsequent listRoles() call", async () => {
    await updateRoleDescription("general_user", "更新後的說明。");

    const list = await listRoles();
    if (!list.ok) throw new Error("expected ok");
    const generalUser = list.value.find((summary) => summary.role === "general_user");
    expect(generalUser?.description).toBe("更新後的說明。");
  });

  it("trims whitespace from the description", async () => {
    const result = await updateRoleDescription("general_user", "  有空白的說明。  ");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.description).toBe("有空白的說明。");
  });

  it("only changes the targeted role's description, leaving every other role untouched", async () => {
    const before = await listRoles();
    if (!before.ok) throw new Error("expected ok");
    const othersBefore = before.value.filter((summary) => summary.role !== "general_user");

    await updateRoleDescription("general_user", "更新後的說明。");

    const after = await listRoles();
    if (!after.ok) throw new Error("expected ok");
    const othersAfter = after.value.filter((summary) => summary.role !== "general_user");
    expect(othersAfter).toEqual(othersBefore);
  });

  it("rejects an empty description", async () => {
    const result = await updateRoleDescription("general_user", "   ");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("does not persist anything when validation fails (no partial side effect)", async () => {
    await updateRoleDescription("general_user", "");

    const fetched = await getRole("general_user");
    if (!fetched.ok) throw new Error("expected ok");
    expect(fetched.value?.description).toBe("一般企業員工。");
  });

  it("returns NOT_FOUND for an unknown role", async () => {
    const result = await updateRoleDescription("not-a-real-role", "有效的說明");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});
