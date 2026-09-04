import type { ApiError, Result } from "@ai-km/types";

/**
 * E11-S015 "Audit viewer". Unlike every prior E11 admin story that
 * borrowed from a Team-B-owned concept (`departments.ts`/`groups.ts`/
 * `prompts.ts`/`models.ts`/`connectors.ts`), an audit event is not
 * something Team A can honestly seed OR let an admin create: an audit
 * trail's entire value is being a truthful record of things that
 * actually happened, and `archive/AI_KM_BMAD_High_Granularity/epics/
 * E14_Audit,_Security_&_Observability.md`'s own "E14-S001 Audit event
 * schema"/"E14-S002 Audit append API" (Team B, not built) are the real
 * pipeline that would ever produce one. `contracts/` has zero audit
 * content, and `archive/AI_KM_BMAD_High_Granularity/SOURCE_BASELINE.md` itself
 * never reaches the E14 section body (the file ends at line 1929,
 * mid-word, well before it). Fabricating sample audit entries here
 * would misrepresent real historical events that never happened — a
 * different, more serious kind of dishonesty than an empty Prompt
 * catalog an admin can freely populate.
 *
 * `AuditEvent`'s shape below is therefore Team A's own provisional
 * DISPLAY shape for this viewer shell, not a claim about Team B's real
 * E14-S001 schema — it exists only so the loading/error/empty/loaded
 * states and rendering logic can be built and tested (component tests
 * use fixture data for the loaded state) ahead of a real event source.
 * `listAuditEvents()` always returns an empty list — the one honest
 * answer today — no sessionStorage read/write path exists at all,
 * since there is no legitimate way for this story to ever write to it.
 */
export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  occurredAt: string;
}

export async function listAuditEvents(): Promise<Result<AuditEvent[], ApiError>> {
  return { ok: true, value: [] };
}
