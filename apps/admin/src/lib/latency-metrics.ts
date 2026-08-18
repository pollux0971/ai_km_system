import type { ApiError, Result } from "@ai-km/types";

/**
 * E13-S013 "Latency dashboard". Same cross-app boundary `usage-
 * metrics.ts` (E11-S021/E13-S012) already established for DAU/questions:
 * apps/admin and apps/web are two independent Next.js apps with no real
 * backend between them, and apps/web's own `usage-events.ts` (E13-S009~
 * S013) — the one place `rag_answer_outcome.latencyMs` and
 * `computeAverageLatencyMs` actually exist — has no channel apps/admin
 * can read. Unlike DAU/questions (E11-S021 already built `/usage`'s own
 * presentation layer, waiting only on real data), NO admin page for
 * "latency" existed anywhere before this story — `usage-metrics.ts`'s
 * own doc comment named it "E13-S013's own separate future story"
 * without ever reserving a page for it, and neither
 * `AI_KM_BMAD_High_Granularity/epics/E11_Admin_Console.md` nor `apps/
 * admin/src/app/page.tsx`'s link list has any "latency" entry. So this
 * story builds BOTH: the presentation layer below (mirroring `/usage`'s
 * own loading/error/loaded shape) AND, on the data-owning side
 * (apps/web's usage-events.ts), the actual measurement + aggregation
 * math — see that file's own doc comment for the full reasoning.
 *
 * `averageLatencyMs: null` — not `0` — is the one honest answer today.
 * `usage-metrics.ts`'s own doc comment already explains why a fabricated
 * non-zero placeholder would be a more dangerous form of dishonesty than
 * an honest absence; `null` here is even more precise than that file's
 * `0`, since `0` would additionally misread as "answers are
 * instantaneous" rather than "no data available at all" (the same
 * "average of zero samples is undefined" reasoning `usage-events.ts`'s
 * own `computeAverageLatencyMs` already applies). No write path exists —
 * there is no legitimate way for this story to ever populate a real
 * number itself.
 */
export interface LatencyMetrics {
  averageLatencyMs: number | null;
}

export async function getLatencyMetrics(): Promise<Result<LatencyMetrics, ApiError>> {
  return { ok: true, value: { averageLatencyMs: null } };
}
