/**
 * Adapter: this package's own `EmbeddingProvider` seam (`./provider.ts`),
 * backed by the deterministic feature-hashing provider that E12-S032
 * relocated into `@ai-km/service-model-gateway`
 * (`services/model-gateway/src/embedding/deterministic.provider.ts` — see
 * that file for the actual hashing/normalisation implementation and its own
 * unit tests; none of that logic is duplicated here).
 *
 * ROUTES THROUGH `createModelGateway().embed()`, NOT THE PROVIDER DIRECTLY
 * (E12-S032 follow-up). ADR 0007 §1 names the in-process
 * `createModelGateway().embed()` call the PRIMARY path — every caller,
 * in-process or over HTTP, is meant to funnel through it, because that is the
 * one seam every provider answer is checked at (input validation, the
 * batch-count check, and — since this follow-up — the vector-dimension
 * check). Calling `provider.embed()` directly here would have made this
 * adapter a second, unchecked path around that gate: the exact "wrapper vs.
 * second implementation" drift `routes/model-gateway-routes.ts`'s own AC-R1
 * exists to catch, just on the in-process side instead of HTTP.
 *
 * This file does no hashing and no gate logic of its own. It only translates
 * between the two packages' differing `EmbeddingProvider` shapes:
 *   - this package:    embed(texts: readonly string[]): Promise<readonly Embedding[]>
 *                       (`Embedding` = `Float32Array`), rated via `componentId`.
 *   - model-gateway:   ModelGateway.embed(request: EmbedRequest, correlationId):
 *                       Promise<EmbedResponse>, where
 *                       `EmbedResponse.data: {index, embedding: number[]}[]`.
 *
 * `createModelGateway` requires a `generation` dependency even though this
 * adapter only ever calls `.embed()`; `UNUSED_GENERATION_PROVIDER` below
 * exists solely to satisfy that shape and throws if it is ever actually
 * invoked, rather than silently returning a fake answer.
 */
// Package barrel (`@ai-km/service-model-gateway`): the deep imports this
// file used before E12-S034 are gone now that model-gateway's tsconfig also
// sets `exactOptionalPropertyTypes` — the barrel no longer surfaces a
// pre-existing, unrelated type error in the ASR route module it re-exports
// transitively via `modelGatewayPlugin`.
import {
  createModelGateway,
  createDeterministicEmbeddingProvider as createModelGatewayDeterministicProvider,
  type GenerationProvider,
} from "@ai-km/service-model-gateway";
import type { Embedding, EmbeddingProvider } from "./provider.js";

export interface DeterministicProviderOptions {
  readonly dimensions?: number;
}

const PLACEHOLDER_CORRELATION_ID = "rag-skeleton:deterministic";

/**
 * Never invoked in practice — this adapter only ever calls `gateway.embed()`.
 * Throwing (rather than quietly stubbing an answer) turns a future wiring
 * mistake that reaches `.generate()` on this gateway into a loud failure
 * instead of a silently wrong one.
 */
const UNUSED_GENERATION_PROVIDER: GenerationProvider = {
  name: "fake",
  model: "rag-skeleton-adapter-embedding-only",
  fidelityCeiling: "PF0",
  async generate(): Promise<never> {
    throw new Error(
      "此 adapter 只用於 embedding,generate() 不應被呼叫——這是接線錯誤。",
    );
  },
};

export function createDeterministicEmbeddingProvider(
  options: DeterministicProviderOptions = {},
): EmbeddingProvider {
  const embedding = createModelGatewayDeterministicProvider(options);
  const gateway = createModelGateway({ embedding, generation: UNUSED_GENERATION_PROVIDER });

  return {
    componentId: "embedding:deterministic",
    fidelityCeiling: embedding.fidelityCeiling,
    dimensions: embedding.dimensions,

    async embed(texts: readonly string[]): Promise<readonly Embedding[]> {
      const response = await gateway.embed({ input: texts }, PLACEHOLDER_CORRELATION_ID);
      // `EmbedResponse.data` is in input order (the contract guarantees it,
      // and `createModelGateway` builds it that way) — see
      // `contracts/openapi/embedding.yaml`.
      return response.data.map((d) => Float32Array.from(d.embedding));
    },
  };
}
