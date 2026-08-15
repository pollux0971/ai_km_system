import { describe, expect, it } from "vitest";
import { createDiagnosticSession, getDiagnosticSessionForCase } from "./diagnostic-sessions";
import { createMaintenanceCase } from "./maintenance-cases";
import { EQUIPMENT_OPTIONS } from "./equipment";

describe("createDiagnosticSession / getDiagnosticSessionForCase (E07-S006)", () => {
  it("creates a session at status OPEN for a real case, and it's then findable by getDiagnosticSessionForCase", async () => {
    const equipment = EQUIPMENT_OPTIONS[0];
    if (!equipment) throw new Error("EQUIPMENT_OPTIONS must not be empty");
    const created = await createMaintenanceCase(equipment.id);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await createDiagnosticSession(created.value.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("OPEN");
    expect(result.value.maintenanceCaseId).toBe(created.value.id);
    expect(result.value.id).toBeTruthy();
    expect(result.value.createdAt).toBeTruthy();
    expect(result.value.updatedAt).toBe(result.value.createdAt);

    const fetched = await getDiagnosticSessionForCase(created.value.id);
    expect(fetched.ok).toBe(true);
    if (fetched.ok) expect(fetched.value).toEqual(result.value);
  });

  it("fails with NOT_FOUND for an unknown maintenanceCaseId, with no side effect on the store", async () => {
    const before = await getDiagnosticSessionForCase("not-a-real-case-id");
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect(before.value).toBeNull();

    const result = await createDiagnosticSession("not-a-real-case-id");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");

    const after = await getDiagnosticSessionForCase("not-a-real-case-id");
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.value).toBeNull();
  });

  it("getDiagnosticSessionForCase resolves null (not an error) for a real case with no session yet", async () => {
    const equipment = EQUIPMENT_OPTIONS[1];
    if (!equipment) throw new Error("EQUIPMENT_OPTIONS must have at least 2 entries");
    const created = await createMaintenanceCase(equipment.id);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await getDiagnosticSessionForCase(created.value.id);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });
});
