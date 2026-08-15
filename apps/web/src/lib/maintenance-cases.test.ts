import { describe, expect, it } from "vitest";
import { createMaintenanceCase, listMaintenanceCases } from "./maintenance-cases";
import { EQUIPMENT_OPTIONS } from "./equipment";
import { ERROR_CODE_OPTIONS } from "./error-codes";

describe("listMaintenanceCases (E07-S001)", () => {
  it("resolves with a non-empty list of maintenance case summaries", async () => {
    const result = await listMaintenanceCases();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      for (const item of result.value) {
        expect(item.id).toBeTruthy();
        expect(item.title).toBeTruthy();
        expect(item.updatedAt).toBeTruthy();
      }
    }
  });

  it("returns the same items on repeated calls (stable across the session)", async () => {
    const first = await listMaintenanceCases();
    const second = await listMaintenanceCases();

    expect(first).toEqual(second);
  });

  it("orders items most-recently-updated first", async () => {
    const result = await listMaintenanceCases();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const timestamps = result.value.map((item) => item.updatedAt);
    const sorted = [...timestamps].sort((a, b) => b.localeCompare(a));
    expect(timestamps).toEqual(sorted);
  });
});

describe("createMaintenanceCase (E07-S002)", () => {
  // This file's sessionStorage-backed store is shared and accumulates
  // across every test that calls createMaintenanceCase() within this
  // same run, same precedent lib/knowledge-bases.test.ts's own
  // createKnowledgeBase block already establishes — this block runs
  // after the pure-read S001 block above, so it never affects that
  // block's assertions against the pristine 3-item seed.

  it("creates a case titled after the selected equipment's own name", async () => {
    const equipment = EQUIPMENT_OPTIONS[0];
    if (!equipment) throw new Error("EQUIPMENT_OPTIONS must not be empty");

    const result = await createMaintenanceCase(equipment.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe(equipment.name);
    expect(result.value.equipmentId).toBe(equipment.id);
    expect(result.value.id).toBeTruthy();
    expect(result.value.updatedAt).toBeTruthy();
  });

  it("fails with VALIDATION_ERROR for an empty or unrecognized equipmentId, with no side effect on the store", async () => {
    const before = await listMaintenanceCases();
    expect(before.ok).toBe(true);
    if (!before.ok) return;

    const emptyResult = await createMaintenanceCase("");
    const unknownResult = await createMaintenanceCase("not-a-real-equipment-id");

    expect(emptyResult.ok).toBe(false);
    if (!emptyResult.ok) expect(emptyResult.error.code).toBe("VALIDATION_ERROR");
    expect(unknownResult.ok).toBe(false);
    if (!unknownResult.ok) expect(unknownResult.error.code).toBe("VALIDATION_ERROR");

    const after = await listMaintenanceCases();
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.value).toEqual(before.value);
  });

  it("a newly created case appears in listMaintenanceCases(), sorted first as the most recently updated", async () => {
    const equipment = EQUIPMENT_OPTIONS[1];
    if (!equipment) throw new Error("EQUIPMENT_OPTIONS must have at least 2 entries");

    const created = await createMaintenanceCase(equipment.id);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const after = await listMaintenanceCases();
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.value[0]).toEqual(created.value);
  });
});

describe("createMaintenanceCase serialNumber (E07-S003)", () => {
  it("stores a trimmed serial number when one is given", async () => {
    const equipment = EQUIPMENT_OPTIONS[2];
    if (!equipment) throw new Error("EQUIPMENT_OPTIONS must have at least 3 entries");

    const result = await createMaintenanceCase(equipment.id, "  SN-2026-0042  ");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.serialNumber).toBe("SN-2026-0042");
  });

  it("stays valid — same as E07-S002's own equipment-only flow — when serialNumber is omitted, empty, or whitespace-only", async () => {
    const equipment = EQUIPMENT_OPTIONS[0];
    if (!equipment) throw new Error("EQUIPMENT_OPTIONS must not be empty");

    const omitted = await createMaintenanceCase(equipment.id);
    const empty = await createMaintenanceCase(equipment.id, "");
    const whitespaceOnly = await createMaintenanceCase(equipment.id, "   ");

    expect(omitted.ok && empty.ok && whitespaceOnly.ok).toBe(true);
    if (!omitted.ok || !empty.ok || !whitespaceOnly.ok) return;
    expect(omitted.value.serialNumber).toBeUndefined();
    expect(empty.value.serialNumber).toBeUndefined();
    expect(whitespaceOnly.value.serialNumber).toBeUndefined();
  });
});

describe("createMaintenanceCase errorCode (E07-S004)", () => {
  it("stores a recognized error code when one is given", async () => {
    const equipment = EQUIPMENT_OPTIONS[0];
    const errorCodeOption = ERROR_CODE_OPTIONS[0];
    if (!equipment) throw new Error("EQUIPMENT_OPTIONS must not be empty");
    if (!errorCodeOption) throw new Error("ERROR_CODE_OPTIONS must not be empty");

    const result = await createMaintenanceCase(equipment.id, undefined, errorCodeOption.code);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.errorCode).toBe(errorCodeOption.code);
  });

  it("stays valid — same as E07-S002's own equipment-only flow — when errorCode is omitted, empty, or whitespace-only", async () => {
    const equipment = EQUIPMENT_OPTIONS[1];
    if (!equipment) throw new Error("EQUIPMENT_OPTIONS must have at least 2 entries");

    const omitted = await createMaintenanceCase(equipment.id);
    const empty = await createMaintenanceCase(equipment.id, undefined, "");
    const whitespaceOnly = await createMaintenanceCase(equipment.id, undefined, "   ");

    expect(omitted.ok && empty.ok && whitespaceOnly.ok).toBe(true);
    if (!omitted.ok || !empty.ok || !whitespaceOnly.ok) return;
    expect(omitted.value.errorCode).toBeUndefined();
    expect(empty.value.errorCode).toBeUndefined();
    expect(whitespaceOnly.value.errorCode).toBeUndefined();
  });

  it("fails with VALIDATION_ERROR for a non-empty but unrecognized error code, with no side effect on the store", async () => {
    const equipment = EQUIPMENT_OPTIONS[2];
    if (!equipment) throw new Error("EQUIPMENT_OPTIONS must have at least 3 entries");

    const before = await listMaintenanceCases();
    expect(before.ok).toBe(true);
    if (!before.ok) return;

    const result = await createMaintenanceCase(equipment.id, undefined, "NOT-A-REAL-CODE");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");

    const after = await listMaintenanceCases();
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.value).toEqual(before.value);
  });
});

describe("createMaintenanceCase problemDescription (E07-S005)", () => {
  it("uses the trimmed problem description as the case's title when one is given", async () => {
    const equipment = EQUIPMENT_OPTIONS[0];
    if (!equipment) throw new Error("EQUIPMENT_OPTIONS must not be empty");

    const result = await createMaintenanceCase(equipment.id, undefined, undefined, "  異常震動且伴隨高頻噪音  ");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("異常震動且伴隨高頻噪音");
  });

  it("stays valid — same as E07-S002's own equipment-only flow — falling back to the equipment name when problemDescription is omitted, empty, or whitespace-only", async () => {
    const equipment = EQUIPMENT_OPTIONS[1];
    if (!equipment) throw new Error("EQUIPMENT_OPTIONS must have at least 2 entries");

    const omitted = await createMaintenanceCase(equipment.id);
    const empty = await createMaintenanceCase(equipment.id, undefined, undefined, "");
    const whitespaceOnly = await createMaintenanceCase(equipment.id, undefined, undefined, "   ");

    expect(omitted.ok && empty.ok && whitespaceOnly.ok).toBe(true);
    if (!omitted.ok || !empty.ok || !whitespaceOnly.ok) return;
    expect(omitted.value.title).toBe(equipment.name);
    expect(empty.value.title).toBe(equipment.name);
    expect(whitespaceOnly.value.title).toBe(equipment.name);
  });

  it("does not add a separate problemDescription field to the stored case — the text becomes title directly", async () => {
    const equipment = EQUIPMENT_OPTIONS[2];
    if (!equipment) throw new Error("EQUIPMENT_OPTIONS must have at least 3 entries");

    const result = await createMaintenanceCase(equipment.id, undefined, undefined, "感測器讀值飄移");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toHaveProperty("problemDescription");
  });
});
