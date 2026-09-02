/**
 * Adapter: this package's own `GenerationProvider` seam (`./provider.ts`),
 * backed by the canned provider that E12-S033 relocated into
 * `@ai-km/service-model-gateway`
 * (`services/model-gateway/src/generation/canned.provider.ts` — see that
 * file for the actual answer/citation construction; none of that logic is
 * duplicated here).
 *
 * ROUTES THROUGH `createModelGateway().generate()`, NOT THE PROVIDER
 * DIRECTLY — same reasoning as
 * `../embedding/model-gateway-deterministic.provider.ts` (E12-S032 follow-up)
 * and ADR 0007 §1: `createModelGateway().generate()` is the ONE seam every
 * provider answer is checked at (input validation, the no-context rule, and
 * — since E12-S033 — the single consolidated `assertCitationsGrounded`).
 * Calling `provider.generate()` directly here would make this adapter a
 * second, unchecked path around that gate.
 *
 * This file does no answer construction and no grounding logic of its own.
 * It only translates between the two packages' differing shapes:
 *   - this package:  generate(request: {question, context: RetrievalHit[]})
 *                     => Promise<{answer, citations}>
 *   - model-gateway: ModelGateway.generate(request: GenerateRequest,
 *                     correlationId) => Promise<GenerateResponse>, where
 *                     `GenerateRequest.context: ContextChunk[]` has NO
 *                     `scopeKey` field.
 *
 * `RetrievalHit` IS structurally assignable to `ContextChunk` (it has every
 * required field, plus `scopeKey` and a non-optional `score`) — TypeScript
 * would not catch passing it straight through, and doing so would put a
 * department identifier (`scopeKey`) on a value that reaches the generation
 * seam. `contracts/openapi/__checks__/generation-compat.ts` calls this out
 * explicitly ("the client must project explicitly, field by field") for the
 * eventual HTTP client; this in-process adapter is that client's sibling and
 * follows the same rule below.
 *
 * `createModelGateway` requires an `embedding` dependency even though this
 * adapter only ever calls `.generate()`; `UNUSED_EMBEDDING_PROVIDER` below
 * exists solely to satisfy that shape and throws if it is ever actually
 * invoked, rather than silently returning a fake vector.
 */
// Package barrel (`@ai-km/service-model-gateway`): the deep imports this
// file used before E12-S034 are gone now that model-gateway's tsconfig also
// sets `exactOptionalPropertyTypes` — the barrel no longer surfaces a
// pre-existing, unrelated type error in the ASR route module it re-exports
// transitively via `modelGatewayPlugin`.
import {
  createModelGateway,
  createCannedGenerationProvider as createModelGatewayCannedProvider,
  type ContextChunk,
  type GenerateInput,
  type GenerationProvider as ModelGatewayGenerationProvider,
  type EmbeddingProvider,
} from "@ai-km/service-model-gateway";
import type { GenerationProvider, GenerationRequest, GenerationResult } from "./provider.js";

export interface CannedProviderOptions {
  /**
   * Overrides the answer body. Operates on the model-gateway's `GenerateInput`
   * (interface-forced: the adapter forwards this option straight through
   * rather than re-wrapping it in this package's `GenerationRequest` shape).
   * Citations are still derived from context regardless.
   */
  readonly answerTemplate?: (input: GenerateInput) => string;
}

const PLACEHOLDER_CORRELATION_ID = "rag-skeleton:canned-generation";

/**
 * Never invoked in practice — this adapter only ever calls `gateway.generate()`.
 * Throwing (rather than quietly stubbing a vector) turns a future wiring
 * mistake that reaches `.embed()` on this gateway into a loud failure instead
 * of a silently wrong one.
 */
const UNUSED_EMBEDDING_PROVIDER: EmbeddingProvider = {
  name: "fake",
  model: "rag-skeleton-adapter-generation-only",
  dimensions: 0,
  fidelityCeiling: "PF0",
  async embed(): Promise<never> {
    throw new Error("此 adapter 只用於 generation,embed() 不應被呼叫——這是接線錯誤。");
  },
};

export function createCannedGenerationProvider(
  options: CannedProviderOptions = {},
): GenerationProvider {
  const generation: ModelGatewayGenerationProvider = createModelGatewayCannedProvider(
    options.answerTemplate ? { answerTemplate: options.answerTemplate } : {},
  );
  const gateway = createModelGateway({ embedding: UNUSED_EMBEDDING_PROVIDER, generation });

  return {
    componentId: "generation:canned",
    fidelityCeiling: generation.fidelityCeiling,

    async generate(request: GenerationRequest): Promise<GenerationResult> {
      // Explicit field-by-field projection — see file header. `hit.score` is
      // always a number on `RetrievalHit`; `ContextChunk.score` is optional,
      // so passing it through is safe in both directions.
      const context: ContextChunk[] = request.context.map((hit) => ({
        chunkId: hit.chunkId,
        documentId: hit.documentId,
        text: hit.text,
        startOffset: hit.startOffset,
        endOffset: hit.endOffset,
        score: hit.score,
      }));

      const response = await gateway.generate(
        { question: request.question, context },
        PLACEHOLDER_CORRELATION_ID,
      );

      return { answer: response.answer, citations: response.citations };
    },
  };
}
