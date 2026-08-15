"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { createMaintenanceCase } from "@/lib/maintenance-cases";
import { EQUIPMENT_OPTIONS } from "@/lib/equipment";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:maintenance-new");

const UNSELECTED_VALUE = "";

/**
 * E07-S002 "Equipment selector" — the first step of starting a new
 * maintenance case, same "real form, not a zero-input auto-create"
 * shape createKnowledgeBase's own /knowledge/new already established
 * (a maintenance case is a longer-lived record picked from a real,
 * if currently fixed, equipment list — not a title-less placeholder
 * the way conversations/new is). /maintenance (E07-S001) deliberately
 * left out an entry point to this route; this story is exactly what
 * adds it (see maintenance/page.tsx's own updated doc comment).
 *
 * Submit is disabled until an equipment option is actually chosen —
 * same "defense in depth, not the only guard" precedent as
 * knowledge/new/page.tsx: createMaintenanceCase() also fails closed
 * with VALIDATION_ERROR server-side for an empty/unrecognized id, so a
 * buggy/bypassed client still can't create a case with no equipment.
 *
 * Not optimistic, same reasoning as every sibling create form in this
 * codebase (this mock resolves near-instantly, nothing real to hide
 * behind an optimistic update) — the selection stays on screen and
 * unsaved until creation is confirmed, and stays put (not reset) if it
 * fails, so the user doesn't have to re-pick anything to retry.
 *
 * Redirects to /maintenance (the home list) on success, not to a case
 * detail page — /maintenance/[id] (E07-S021 "Case detail") doesn't
 * exist yet, same constraint knowledge/new/page.tsx documents for why
 * it redirects to /knowledge instead of /knowledge/[id].
 *
 * Functional AC 7 (audit event for sensitive operations) is judged
 * N/A — creating a new case is a content-creation action, not an
 * access-control change, same category createKnowledgeBase/
 * addKnowledgeBaseDocument already established (S003/S011 precedent).
 * Equipment identifiers are a small fixed-vocabulary selection (the
 * same category as AiModel/Role), not free-form enterprise content, so
 * telemetry includes the actual equipmentId chosen.
 */
export default function NewMaintenanceCasePage() {
  const router = useRouter();
  const selectId = useId();
  const [equipmentId, setEquipmentId] = useState(UNSELECTED_VALUE);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (equipmentId === UNSELECTED_VALUE || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("creating maintenance case", { correlationId, equipmentId });
    trackEvent("maintenance_case_create_attempt", { correlationId, properties: { equipmentId } });

    const result = await createMaintenanceCase(equipmentId);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to create maintenance case", { correlationId, equipmentId, code: result.error.code });
      trackEvent("maintenance_case_create_failure", { correlationId, properties: { equipmentId, code: result.error.code } });
      setError(true);
      return;
    }

    logger.info("maintenance case created", { correlationId, maintenanceCaseId: result.value.id });
    trackEvent("maintenance_case_create_success", { correlationId, properties: { maintenanceCaseId: result.value.id, equipmentId } });
    router.refresh();
    router.replace("/maintenance");
  }

  return (
    <main style={{ padding: 32 }}>
      <h1>新增維修案例</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={selectId}>選擇設備</label>
          <br />
          <select
            id={selectId}
            value={equipmentId}
            onChange={(event) => setEquipmentId(event.target.value)}
            disabled={pending}
          >
            <option value={UNSELECTED_VALUE}>請選擇設備</option>
            {EQUIPMENT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending || equipmentId === UNSELECTED_VALUE}>
          建立案例
        </button>{" "}
        <Link href="/maintenance">取消</Link>
      </form>
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="無法建立維修案例，請稍後再試。" />
        </div>
      )}
    </main>
  );
}
