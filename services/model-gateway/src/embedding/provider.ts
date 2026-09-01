/**
 * `EmbeddingProvider` — the Model Gateway's embedding seam.
 *
 * Shape copied deliberately from `../asr/provider.ts`: a named provider with a
 * declared model, one method, and typed failures the route maps to contract
 * codes. Same reasoning, same review surface.
 *
 * WHY THERE IS NO REAL PROVIDER HERE YET
 *
 * `WhisperServerProvider` could be written because whisper.cpp publishes the
 * upstream API it speaks. No embedding runtime has been chosen for this
 * deployment — that is **E04-S037** (`todo`, Team B: hardware sizing and local
 * model preparation). Writing an `HttpEmbeddingProvider` now would mean
 * inventing the upstream request/response shape, which ATOMIC_STORY_BOUNDARIES'
 * AI Agent Rule forbids ("不知道 provider capability → 查 contract/config").
 * So this ships the abstraction, the fake, the routes and the error mapping —
 * exactly the split E12-S031 used while E12-S030 was still open.
 */
import type { ProviderFidelity } from "../fidelity.js";

export type EmbeddingProviderName = "fake";

export interface EmbedInput {
  readonly texts: readonly string[];
  /** Optional pin. Omitted means "provider default". */
  readonly model?: string;
  readonly timeoutMs: number;
  readonly correlationId: string;
}

export interface EmbedResult {
  /** One vector per input, IN INPUT ORDER. Callers index positionally. */
  readonly vectors: readonly (readonly number[])[];
  readonly model: string;
  readonly dimensions: number;
}

export interface EmbeddingProvider {
  readonly name: EmbeddingProviderName;
  readonly model: string;
  readonly dimensions: number;
  /** The highest evidence this provider can honestly support. */
  readonly fidelityCeiling: ProviderFidelity;
  embed(input: EmbedInput): Promise<EmbedResult>;
}

/**
 * The model is unreachable, or answered with something unusable.
 *
 * Timeouts currently fold into this too: `contracts/openapi/embedding.yaml`
 * defines no 504, and adding one is a contract change belonging to
 * **E04-S028 (RAG timeout/cancellation)**, not to this wiring. Recorded here
 * rather than silently conflated.
 */
export class EmbeddingUnavailableError extends Error {
  override readonly name = "EmbeddingUnavailableError";
}

/**
 * Placeholder fake. **Wiring only.**
 *
 * It hashes the WHOLE text into a single bucket, so it has no token structure
 * at all and models no lexical similarity whatsoever — it cannot be mistaken
 * for a retrieval-quality provider, which is the point. It exists so the route,
 * the in-process function and the error mapping can be tested end to end.
 *
 * The real fake — feature hashing with CJK bigrams, PF1, already written and
 * tested in `services/rag-skeleton/src/embedding/deterministic.provider.ts` —
 * moves here under **g5**, which is a story of its own. Do not build retrieval
 * behaviour on this class in the meantime.
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly name = "fake" as const;
  readonly model = "fake-placeholder";
  readonly dimensions: number;
  readonly fidelityCeiling: ProviderFidelity = "PF1";

  constructor(dimensions = 256) {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error("dimensions 必須是正整數。");
    }
    this.dimensions = dimensions;
  }

  async embed(input: EmbedInput): Promise<EmbedResult> {
    const vectors = input.texts.map((text) => {
      const vector = new Array<number>(this.dimensions).fill(0);
      let hash = 0x811c9dc5;
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      vector[hash % this.dimensions] = 1; // already unit length
      return vector;
    });
    return { vectors, model: this.model, dimensions: this.dimensions };
  }
}
