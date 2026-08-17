import type { ApiError, Result } from "@ai-km/types";

/**
 * E11-S018 "Document failure queue". Unlike Department/Group/Prompt/
 * Model/Connector (all Team-B-owned concepts Team A can honestly seed
 * or let an admin manage), the underlying "a document's processing can
 * fail" concept here is NOT missing — `apps/web`'s own `knowledge-
 * documents.ts` already built it for real, as its own E05-S020
 * "Processing failure state" / E05-S021 "Retry processing action"
 * (both Team A, both approved): a document can genuinely reach
 * `status: "failed"` and be retried, entirely within a single
 * knowledge base's own document list.
 *
 * What's actually missing is a cross-knowledge-base AGGREGATION
 * channel: this admin queue's whole point is surfacing failures from
 * every knowledge base at once, and that requires a real backend query
 * (something like `GET /admin/documents?status=failed` spanning every
 * KB) that doesn't exist — `contracts/openapi/core.yaml` has zero
 * document paths. Reading `apps/web`'s own sessionStorage directly is
 * not a legitimate substitute: apps/admin and apps/web are separate
 * Next.js apps with fully independent per-origin browser storage (same
 * "apps/admin and apps/web have fully independent sessionStorage"
 * boundary models.ts's own E11-S013 doc comment already establishes for
 * a different domain), and a real production admin console would query
 * a real shared backend, never another frontend's local browser state.
 * Confirming this is also honestly the RIGHT empty answer today, not
 * just the safe one: `apps/web`'s own `SAMPLE_KNOWLEDGE_BASE_DOCUMENTS`
 * seed fixture has zero documents with `status: "failed"` — every
 * seeded document is implicitly "ready" — so even a real aggregation
 * channel would currently report nothing to show.
 *
 * `FailedDocument`'s shape below mirrors the relevant fields of
 * `apps/web`'s own already-approved `KnowledgeBaseDocument` (id,
 * knowledgeBaseId, name, sizeBytes, uploadedAt) — not an invented
 * shape, since that entity genuinely already exists and is owned by
 * Team A's own E05 epic. `listFailedDocuments()` always returns an
 * empty list — the one honest answer today — no write path exists,
 * since this story's own job is surfacing failures, not fabricating
 * or curing them (E11-S019 "Retry processing" is a later story's own
 * job).
 */
export interface FailedDocument {
  id: string;
  knowledgeBaseId: string;
  name: string;
  sizeBytes?: number;
  uploadedAt: string;
}

export async function listFailedDocuments(): Promise<Result<FailedDocument[], ApiError>> {
  return { ok: true, value: [] };
}
