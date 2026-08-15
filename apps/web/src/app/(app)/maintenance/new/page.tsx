"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { createMaintenanceCase } from "@/lib/maintenance-cases";
import { EQUIPMENT_OPTIONS } from "@/lib/equipment";
import { ERROR_CODE_OPTIONS } from "@/lib/error-codes";
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
 *
 * E07-S003 "Serial-number input" adds an optional serial number text
 * field to this same form (see maintenance-cases.ts's own
 * MaintenanceCaseSummary doc comment for why it's optional, not
 * required). Telemetry deliberately excludes the serial number itself
 * — user-typed free text that could incidentally identify specific
 * equipment/site details, same "don't log free-form user content"
 * restraint this codebase already applies to filenames (S011), URLs
 * (S014), and prompt text (S008); only its presence would be safe to
 * log and isn't worth a boolean just for that.
 *
 * E07-S004 "Error-code search UI" adds a search-filtered error code
 * picker — a text query narrows ERROR_CODE_OPTIONS by code OR
 * description, and only the currently-matching options are offered in
 * the `<select>` below it. This is deliberately more than a bare
 * `<select>` (unlike S002's own equipment picker) because this story's
 * own title says "search UI", not just "selector" — the fixed list is
 * still small today, but the search affordance is what this story asks
 * for, not a judgment about the list's current size. If the currently
 * selected code falls out of the filtered set (the query changed after
 * a selection was made), the selection is cleared rather than left
 * silently pointing at an option no longer visible in the dropdown —
 * same "never let a control show a selected value that isn't one of
 * its own currently-offered options" concern
 * KnowledgeDocumentPermissionEditor's own fieldset-disable-while-
 * pending guard is a distant cousin of, applied here to a filtering
 * interaction instead of a pending one. Same optional-but-validated
 * shape as `equipmentId` when present (see createMaintenanceCase's own
 * doc comment) — errorCode is never required, matching S003's own
 * precedent for not breaking the already-approved equipment-only flow.
 *
 * E07-S005 "Problem description input" adds the last field this
 * form's own S002-S005 sequence grows — a plain textarea, not a new
 * stored field: its trimmed text becomes `title` directly (see
 * createMaintenanceCase's own doc comment for the full reasoning).
 * Same submit-based, not instant-apply, shape S008's own prompt editor
 * already established for multi-line free-form text a user actively
 * composes. Telemetry excludes it entirely — free-form text describing
 * a real operational problem is exactly the kind of content
 * serialNumber's own doc comment already restrains logging for, only
 * more so here.
 */
export default function NewMaintenanceCasePage() {
  const router = useRouter();
  const selectId = useId();
  const serialNumberId = useId();
  const errorCodeQueryId = useId();
  const errorCodeSelectId = useId();
  const problemDescriptionId = useId();
  const [equipmentId, setEquipmentId] = useState(UNSELECTED_VALUE);
  const [serialNumber, setSerialNumber] = useState("");
  const [errorCodeQuery, setErrorCodeQuery] = useState("");
  const [errorCode, setErrorCode] = useState(UNSELECTED_VALUE);
  const [problemDescription, setProblemDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const trimmedErrorCodeQuery = errorCodeQuery.trim().toLowerCase();
  const filteredErrorCodeOptions = trimmedErrorCodeQuery
    ? ERROR_CODE_OPTIONS.filter(
        (option) =>
          option.code.toLowerCase().includes(trimmedErrorCodeQuery) || option.description.includes(errorCodeQuery.trim()),
      )
    : ERROR_CODE_OPTIONS;

  function handleErrorCodeQueryChange(value: string) {
    setErrorCodeQuery(value);
    const query = value.trim().toLowerCase();
    const stillMatches =
      errorCode === UNSELECTED_VALUE ||
      !query ||
      ERROR_CODE_OPTIONS.some(
        (option) =>
          option.code === errorCode && (option.code.toLowerCase().includes(query) || option.description.includes(value.trim())),
      );
    if (!stillMatches) setErrorCode(UNSELECTED_VALUE);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (equipmentId === UNSELECTED_VALUE || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("creating maintenance case", {
      correlationId,
      equipmentId,
      hasSerialNumber: serialNumber.trim().length > 0,
      errorCode: errorCode || undefined,
      hasProblemDescription: problemDescription.trim().length > 0,
    });
    trackEvent("maintenance_case_create_attempt", { correlationId, properties: { equipmentId, errorCode: errorCode || undefined } });

    const result = await createMaintenanceCase(equipmentId, serialNumber, errorCode, problemDescription);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to create maintenance case", { correlationId, equipmentId, code: result.error.code });
      trackEvent("maintenance_case_create_failure", { correlationId, properties: { equipmentId, code: result.error.code } });
      setError(true);
      return;
    }

    logger.info("maintenance case created", { correlationId, maintenanceCaseId: result.value.id });
    trackEvent("maintenance_case_create_success", {
      correlationId,
      properties: { maintenanceCaseId: result.value.id, equipmentId, errorCode: errorCode || undefined },
    });
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
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={serialNumberId}>設備序號(選填)</label>
          <br />
          <input
            id={serialNumberId}
            type="text"
            value={serialNumber}
            onChange={(event) => setSerialNumber(event.target.value)}
            disabled={pending}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={errorCodeQueryId}>搜尋錯誤代碼(選填)</label>
          <br />
          <input
            id={errorCodeQueryId}
            type="text"
            value={errorCodeQuery}
            onChange={(event) => handleErrorCodeQueryChange(event.target.value)}
            disabled={pending}
            placeholder="輸入代碼或描述關鍵字"
          />
          <br />
          <label htmlFor={errorCodeSelectId}>錯誤代碼(選填)</label>
          <br />
          <select
            id={errorCodeSelectId}
            value={errorCode}
            onChange={(event) => setErrorCode(event.target.value)}
            disabled={pending}
          >
            <option value={UNSELECTED_VALUE}>不指定錯誤代碼</option>
            {filteredErrorCodeOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} — {option.description}
              </option>
            ))}
          </select>
          {filteredErrorCodeOptions.length === 0 && (
            <p style={{ marginTop: 4 }}>查無符合「{errorCodeQuery.trim()}」的錯誤代碼。</p>
          )}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={problemDescriptionId}>問題描述(選填)</label>
          <br />
          <textarea
            id={problemDescriptionId}
            value={problemDescription}
            onChange={(event) => setProblemDescription(event.target.value)}
            disabled={pending}
            rows={4}
            style={{ width: "100%", maxWidth: 480 }}
          />
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
