import { describe, expect, it } from "vitest";
import { listUsers } from "./users";

describe("listUsers (E11-S002)", () => {
  it("returns a non-empty list of seeded users", async () => {
    const result = await listUsers();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
  });

  it("every user has the fields a list view needs (name, email, department, roles, status)", async () => {
    const result = await listUsers();
    if (!result.ok) throw new Error("expected ok");

    for (const user of result.value) {
      expect(user.userId).toBeTruthy();
      expect(user.name).toBeTruthy();
      expect(user.email).toBeTruthy();
      expect(user.department).toBeTruthy();
      expect(user.roles.length).toBeGreaterThan(0);
      expect(["active", "disabled"]).toContain(user.status);
    }
  });

  it("includes at least one disabled user, so the list-level status display is genuinely exercised", async () => {
    const result = await listUsers();
    if (!result.ok) throw new Error("expected ok");

    expect(result.value.some((user) => user.status === "disabled")).toBe(true);
  });

  it("includes users spanning more than one role, not just a single uniform role", async () => {
    const result = await listUsers();
    if (!result.ok) throw new Error("expected ok");

    const distinctRoles = new Set(result.value.flatMap((user) => user.roles));
    expect(distinctRoles.size).toBeGreaterThan(1);
  });
});
