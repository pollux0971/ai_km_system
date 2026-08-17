import { beforeEach, describe, expect, it } from "vitest";
import { createDepartment, listDepartments } from "./departments";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("listDepartments (E11-S009)", () => {
  it("returns the seeded departments, reusing the exact department names already used elsewhere in this codebase", async () => {
    const result = await listDepartments();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((department) => department.name)).toEqual(["資訊部", "維修部", "業務部", "稽核部"]);
  });

  it("every seeded department has its own distinct departmentId", async () => {
    const result = await listDepartments();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.value.map((department) => department.departmentId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("createDepartment (E11-S009)", () => {
  it("creates a new department and persists it, visible via a subsequent listDepartments() call", async () => {
    const result = await createDepartment({ name: "行銷部" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("行銷部");

    const list = await listDepartments();
    if (!list.ok) throw new Error("expected ok");
    expect(list.value.map((department) => department.name)).toContain("行銷部");
  });

  it("trims whitespace from the name", async () => {
    const result = await createDepartment({ name: "  行銷部  " });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("行銷部");
  });

  it("rejects an empty name", async () => {
    const result = await createDepartment({ name: "   " });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("does not persist anything when validation fails (no partial side effect)", async () => {
    await createDepartment({ name: "" });

    const list = await listDepartments();
    if (!list.ok) throw new Error("expected ok");
    expect(list.value).toHaveLength(4);
  });

  it("does not change any existing department when a new one is created", async () => {
    const before = await listDepartments();
    if (!before.ok) throw new Error("expected ok");

    await createDepartment({ name: "行銷部" });

    const after = await listDepartments();
    if (!after.ok) throw new Error("expected ok");
    expect(after.value.slice(0, before.value.length)).toEqual(before.value);
  });

  it("gives each newly created department its own distinct departmentId, even for the same name", async () => {
    const first = await createDepartment({ name: "行銷部" });
    const second = await createDepartment({ name: "行銷部" });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.departmentId).not.toBe(second.value.departmentId);
  });
});
