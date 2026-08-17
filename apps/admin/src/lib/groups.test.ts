import { beforeEach, describe, expect, it } from "vitest";
import { createGroup, listGroups } from "./groups";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("listGroups (E11-S010)", () => {
  it("returns the seeded groups, reusing the exact group names already used elsewhere in this codebase", async () => {
    const result = await listGroups();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((group) => group.name)).toEqual(["一般使用者群組", "維修工程師群組", "業務群組"]);
  });

  it("every seeded group has its own distinct groupId", async () => {
    const result = await listGroups();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.value.map((group) => group.groupId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("createGroup (E11-S010)", () => {
  it("creates a new group and persists it, visible via a subsequent listGroups() call", async () => {
    const result = await createGroup({ name: "稽核群組" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("稽核群組");

    const list = await listGroups();
    if (!list.ok) throw new Error("expected ok");
    expect(list.value.map((group) => group.name)).toContain("稽核群組");
  });

  it("trims whitespace from the name", async () => {
    const result = await createGroup({ name: "  稽核群組  " });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("稽核群組");
  });

  it("rejects an empty name", async () => {
    const result = await createGroup({ name: "   " });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("does not persist anything when validation fails (no partial side effect)", async () => {
    await createGroup({ name: "" });

    const list = await listGroups();
    if (!list.ok) throw new Error("expected ok");
    expect(list.value).toHaveLength(3);
  });

  it("does not change any existing group when a new one is created", async () => {
    const before = await listGroups();
    if (!before.ok) throw new Error("expected ok");

    await createGroup({ name: "稽核群組" });

    const after = await listGroups();
    if (!after.ok) throw new Error("expected ok");
    expect(after.value.slice(0, before.value.length)).toEqual(before.value);
  });

  it("gives each newly created group its own distinct groupId, even for the same name", async () => {
    const first = await createGroup({ name: "稽核群組" });
    const second = await createGroup({ name: "稽核群組" });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.groupId).not.toBe(second.value.groupId);
  });
});
