import { describe, expect, it } from "vitest";
import { getKnowledgeCandidateForCase, submitKnowledgeCandidate } from "./knowledge-candidates";
import { createMaintenanceCase } from "./maintenance-cases";
import { EQUIPMENT_OPTIONS } from "./equipment";

async function createCase() {
  const equipment = EQUIPMENT_OPTIONS[0];
  if (!equipment) throw new Error("EQUIPMENT_OPTIONS must not be empty");
  const maintenanceCase = await createMaintenanceCase(equipment.id);
  if (!maintenanceCase.ok) throw new Error("failed to create maintenance case fixture");
  return maintenanceCase.value;
}

describe("getKnowledgeCandidateForCase (E07-S023)", () => {
  it("resolves null for a case with no submitted candidate", async () => {
    const maintenanceCase = await createCase();

    const result = await getKnowledgeCandidateForCase(maintenanceCase.id);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("resolves null (not an error) for an unknown maintenanceCaseId", async () => {
    const result = await getKnowledgeCandidateForCase("not-a-real-case-id");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });
});

describe("submitKnowledgeCandidate (E07-S023)", () => {
  it("submits a candidate for a real case, then findable by getKnowledgeCandidateForCase", async () => {
    const maintenanceCase = await createCase();

    const result = await submitKnowledgeCandidate(maintenanceCase.id, "  空壓機異音多半是軸承磨損,更換軸承即可排除。  ");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.maintenanceCaseId).toBe(maintenanceCase.id);
    expect(result.value.content).toBe("空壓機異音多半是軸承磨損,更換軸承即可排除。");
    expect(result.value.id).toBeTruthy();
    expect(result.value.createdAt).toBeTruthy();

    const fetched = await getKnowledgeCandidateForCase(maintenanceCase.id);
    expect(fetched.ok).toBe(true);
    if (fetched.ok) expect(fetched.value).toEqual(result.value);
  });

  it("fails with NOT_FOUND for an unknown maintenanceCaseId, with no store side effect", async () => {
    const result = await submitKnowledgeCandidate("not-a-real-case-id", "候選內容");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("fails with VALIDATION_ERROR for an empty content string, and leaves the store untouched", async () => {
    const maintenanceCase = await createCase();

    const result = await submitKnowledgeCandidate(maintenanceCase.id, "");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");

    const after = await getKnowledgeCandidateForCase(maintenanceCase.id);
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.value).toBeNull();
  });

  it("fails with VALIDATION_ERROR for a whitespace-only content string", async () => {
    const maintenanceCase = await createCase();

    const result = await submitKnowledgeCandidate(maintenanceCase.id, "   ");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("fails with VALIDATION_ERROR when a candidate has already been submitted for the same case (repeat-guard)", async () => {
    const maintenanceCase = await createCase();
    const first = await submitKnowledgeCandidate(maintenanceCase.id, "第一次提交的候選內容");
    expect(first.ok).toBe(true);

    const second = await submitKnowledgeCandidate(maintenanceCase.id, "第二次提交的候選內容");

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("VALIDATION_ERROR");
    if (first.ok) {
      const after = await getKnowledgeCandidateForCase(maintenanceCase.id);
      expect(after.ok).toBe(true);
      if (after.ok) expect(after.value).toEqual(first.value);
    }
  });

  it("keeps candidates for different cases fully independent", async () => {
    const case1 = await createCase();
    const case2 = await createCase();

    await submitKnowledgeCandidate(case1.id, "案例一的候選內容");
    await submitKnowledgeCandidate(case2.id, "案例二的候選內容");

    const fetched1 = await getKnowledgeCandidateForCase(case1.id);
    const fetched2 = await getKnowledgeCandidateForCase(case2.id);
    expect(fetched1.ok && fetched1.value?.content).toBe("案例一的候選內容");
    expect(fetched2.ok && fetched2.value?.content).toBe("案例二的候選內容");
  });
});
