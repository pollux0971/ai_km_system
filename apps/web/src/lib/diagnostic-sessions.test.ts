import { describe, expect, it } from "vitest";
import { createDiagnosticSession, getDiagnosticSessionForCase, selectDecisionOption } from "./diagnostic-sessions";
import { createMaintenanceCase } from "./maintenance-cases";
import { EQUIPMENT_OPTIONS } from "./equipment";
import { getCurrentDiagnosticStep } from "./diagnostic-steps";

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

describe("selectDecisionOption (E07-S008)", () => {
  async function createSession() {
    const equipment = EQUIPMENT_OPTIONS[0];
    if (!equipment) throw new Error("EQUIPMENT_OPTIONS must not be empty");
    const maintenanceCase = await createMaintenanceCase(equipment.id);
    if (!maintenanceCase.ok) throw new Error("failed to create maintenance case fixture");
    const session = await createDiagnosticSession(maintenanceCase.value.id);
    if (!session.ok) throw new Error("failed to create diagnostic session fixture");
    return session.value;
  }

  it("advances currentStepIndex, flips OPEN to IN_PROGRESS, and records the chosen option", async () => {
    const session = await createSession();
    expect(session.currentStepIndex).toBe(0);
    expect(session.status).toBe("OPEN");

    const firstOption = getCurrentDiagnosticStep(0).options?.[0];
    if (!firstOption) throw new Error("step 0 must have at least one option");

    const result = await selectDecisionOption(session.id, firstOption.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.currentStepIndex).toBe(1);
    expect(result.value.status).toBe("IN_PROGRESS");
    expect(result.value.lastSelectedOptionId).toBe(firstOption.id);

    const refetched = await getDiagnosticSessionForCase(session.maintenanceCaseId);
    expect(refetched.ok).toBe(true);
    if (refetched.ok) expect(refetched.value).toEqual(result.value);
  });

  it("fails with NOT_FOUND for an unknown sessionId, with no store side effect", async () => {
    const result = await selectDecisionOption("not-a-real-session-id", "resolved");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("fails with VALIDATION_ERROR for an unrecognized optionId, and leaves the session untouched", async () => {
    const session = await createSession();

    const result = await selectDecisionOption(session.id, "not-a-real-option-id");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");

    const after = await getDiagnosticSessionForCase(session.maintenanceCaseId);
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.value).toEqual(session);
  });

  it("fails with VALIDATION_ERROR when selecting again after already advancing past the decision step (repeat-request guard)", async () => {
    const session = await createSession();
    const firstOption = getCurrentDiagnosticStep(0).options?.[0];
    const secondOption = getCurrentDiagnosticStep(0).options?.[1];
    if (!firstOption || !secondOption) throw new Error("step 0 must have at least 2 options");

    const first = await selectDecisionOption(session.id, firstOption.id);
    expect(first.ok).toBe(true);

    const second = await selectDecisionOption(session.id, secondOption.id);

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("VALIDATION_ERROR");
    if (first.ok) {
      const after = await getDiagnosticSessionForCase(session.maintenanceCaseId);
      expect(after.ok).toBe(true);
      if (after.ok) expect(after.value).toEqual(first.value);
    }
  });
});

describe("selectDecisionOption free-text detail (E07-S009)", () => {
  async function createSession() {
    const equipment = EQUIPMENT_OPTIONS[0];
    if (!equipment) throw new Error("EQUIPMENT_OPTIONS must not be empty");
    const maintenanceCase = await createMaintenanceCase(equipment.id);
    if (!maintenanceCase.ok) throw new Error("failed to create maintenance case fixture");
    const session = await createDiagnosticSession(maintenanceCase.value.id);
    if (!session.ok) throw new Error("failed to create diagnostic session fixture");
    return session.value;
  }

  it("stores a trimmed, non-empty detail alongside the chosen option", async () => {
    const session = await createSession();
    const firstOption = getCurrentDiagnosticStep(0).options?.[0];
    if (!firstOption) throw new Error("step 0 must have at least one option");

    const result = await selectDecisionOption(session.id, firstOption.id, "  現場有明顯異音  ");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lastFreeTextDetail).toBe("現場有明顯異音");
  });

  it("does not store a whitespace-only detail — same absence-means-not-set precedent as maintenance-cases.ts's serialNumber", async () => {
    const session = await createSession();
    const firstOption = getCurrentDiagnosticStep(0).options?.[0];
    if (!firstOption) throw new Error("step 0 must have at least one option");

    const result = await selectDecisionOption(session.id, firstOption.id, "   ");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lastFreeTextDetail).toBeUndefined();
  });

  it("leaves lastFreeTextDetail unset when no detail argument is given at all", async () => {
    const session = await createSession();
    const firstOption = getCurrentDiagnosticStep(0).options?.[0];
    if (!firstOption) throw new Error("step 0 must have at least one option");

    const result = await selectDecisionOption(session.id, firstOption.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lastFreeTextDetail).toBeUndefined();
  });
});
