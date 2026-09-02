/**
 * `GenerationProvider` — the Model Gateway's answer-generation seam.
 *
 * Same shape and same reasoning as `../embedding/provider.ts`; see that file
 * for why no real provider ships yet (E04-S037 has not chosen a runtime).
 *
 * What DID move here (E12-S033): the canned provider — deterministic,
 * context-derived citations, ceiling PF1 — relocated verbatim from
 * `services/rag-skeleton/src/generation/provider.ts`, replacing the
 * `FakeGenerationProvider` placeholder that used to live in this file. See
 * `./canned.provider.ts`.
 */
import type { ProviderFidelity } from "../fidelity.js";

export type GenerationProviderName = "fake";

export interface ContextChunk {
  readonly chunkId: string;
  readonly documentId: string;
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly score?: number;
}

export interface Citation {
  readonly chunkId: string;
  readonly documentId: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface GenerateInput {
  readonly question: string;
  readonly context: readonly ContextChunk[];
  readonly model?: string;
  readonly timeoutMs: number;
  readonly correlationId: string;
}

export interface GenerateResult {
  readonly answer: string;
  readonly citations: readonly Citation[];
  readonly model: string;
}

export interface GenerationProvider {
  readonly name: GenerationProviderName;
  readonly model: string;
  readonly fidelityCeiling: ProviderFidelity;
  generate(input: GenerateInput): Promise<GenerateResult>;
}

/** See `EmbeddingUnavailableError` for why timeouts fold in here for now. */
export class GenerationUnavailableError extends Error {
  override readonly name = "GenerationUnavailableError";
}

/**
 * A citation naming a chunk that was not supplied is a fabricated source.
 *
 * Enforced in the gateway rather than trusted to the provider, because the
 * whole reason baseline §5 rule 28 routes model calls through a gateway is
 * that the provider is the untrusted party. The client rejects the WHOLE
 * response rather than dropping the bad citation: a model that fabricates one
 * source has shown it will fabricate others, and a silently-filtered response
 * looks correct.
 *
 * THE ONE IMPLEMENTATION (E12-S033): `services/rag-skeleton/src/generation/
 * provider.ts` used to carry a second, separately-maintained copy of this
 * exact rule. That copy is gone; `services/rag-skeleton/src/pipeline.ts` now
 * imports and calls this function directly, and its own generation provider
 * routes through `createModelGateway().generate()` (see `../gateway.ts`),
 * which also calls this function. A citation-grounding check with two
 * implementations is two answers to "is this source fabricated", and they
 * would drift — see this story's EVIDENCE for why the pipeline's call and the
 * gateway's call are BOTH kept (defence in depth for a caller that bypasses
 * the gateway) rather than one being deleted as redundant.
 */
export class FabricatedCitationError extends Error {
  override readonly name = "FabricatedCitationError";
}

export function assertCitationsGrounded(
  context: readonly ContextChunk[],
  citations: readonly Citation[],
): readonly Citation[] {
  const supplied = new Set(context.map((c) => c.chunkId));
  const fabricated = citations.filter((c) => !supplied.has(c.chunkId));
  if (fabricated.length > 0) {
    throw new FabricatedCitationError(
      `生成結果引用了 ${fabricated.length} 個不在 context 內的 chunk` +
        `(${fabricated.map((c) => c.chunkId).join(", ")})。` +
        `這代表引用是被捏造的,或 context 在傳遞途中被替換——兩者都不得放行。`,
    );
  }
  return citations;
}
