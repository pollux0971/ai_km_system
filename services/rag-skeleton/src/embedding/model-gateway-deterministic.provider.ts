/**
 * Adapter: this package's own `EmbeddingProvider` seam (`./provider.ts`),
 * backed by the deterministic feature-hashing provider that E12-S032
 * relocated into `@ai-km/service-model-gateway`
 * (`services/model-gateway/src/embedding/deterministic.provider.ts` — see
 * that file for the actual hashing/normalisation implementation and its own
 * unit tests; none of that logic is duplicated here).
 *
 * This file does no hashing. It only translates between the two packages'
 * differing `EmbeddingProvider` shapes:
 *   - this package:    embed(texts: readonly string[]): Promise<readonly Embedding[]>
 *                       (`Embedding` = `Float32Array`), rated via `componentId`.
 *   - model-gateway:   embed(input: EmbedInput): Promise<EmbedResult>
 *                       (`vectors: number[][]`), rated via `name`/`model`.
 *
 * `EmbedInput.timeoutMs`/`correlationId` exist for providers that make a real
 * network call; the deterministic provider computes in-process and ignores
 * both, so fixed placeholder values are supplied here rather than threaded
 * through this adapter's own (texts-only) API.
 */
// Deep import rather than the package barrel (`@ai-km/service-model-gateway`)
// deliberately: that barrel re-exports `modelGatewayPlugin`, which pulls in
// the ASR route module transitively. This package's own tsconfig turns on
// `exactOptionalPropertyTypes`, which surfaces a pre-existing type error in
// that unrelated ASR code once it is part of the same compilation unit — see
// this story's EVIDENCE file. Importing only the embedding module avoids
// dragging in code this adapter has nothing to do with.
import { createDeterministicEmbeddingProvider as createModelGatewayDeterministicProvider } from "@ai-km/service-model-gateway/src/embedding/deterministic.provider.js";
import type { Embedding, EmbeddingProvider } from "./provider.js";

export interface DeterministicProviderOptions {
  readonly dimensions?: number;
}

const PLACEHOLDER_TIMEOUT_MS = 30000;
const PLACEHOLDER_CORRELATION_ID = "rag-skeleton:deterministic";

export function createDeterministicEmbeddingProvider(
  options: DeterministicProviderOptions = {},
): EmbeddingProvider {
  const inner = createModelGatewayDeterministicProvider(options);

  return {
    componentId: "embedding:deterministic",
    fidelityCeiling: inner.fidelityCeiling,
    dimensions: inner.dimensions,

    async embed(texts: readonly string[]): Promise<readonly Embedding[]> {
      const result = await inner.embed({
        texts,
        timeoutMs: PLACEHOLDER_TIMEOUT_MS,
        correlationId: PLACEHOLDER_CORRELATION_ID,
      });
      return result.vectors.map((v) => Float32Array.from(v));
    },
  };
}
