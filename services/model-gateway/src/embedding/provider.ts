/**
 * `EmbeddingProvider` — the Model Gateway's embedding seam.
 *
 * Shape copied deliberately from `../asr/provider.ts`: a named provider with a
 * declared model, one method, and typed failures the route maps to contract
 * codes. Same reasoning, same review surface.
 *
 * WHY THERE IS STILL NO HTTP PROVIDER HERE
 *
 * `WhisperServerProvider` could be written because whisper.cpp publishes the
 * upstream API it speaks. No embedding runtime has been chosen for this
 * deployment — that is **E04-S037** (`todo`, Team B: hardware sizing and local
 * model preparation). Writing an `HttpEmbeddingProvider` now would mean
 * inventing the upstream request/response shape, which ATOMIC_STORY_BOUNDARIES'
 * AI Agent Rule forbids ("不知道 provider capability → 查 contract/config").
 *
 * What DID move here (E12-S032): the deterministic feature-hashing provider —
 * FNV-1a, CJK bigrams, L2-normalised, ceiling PF1 — relocated verbatim from
 * `services/rag-skeleton/src/embedding/deterministic.provider.ts`, replacing
 * the placeholder that used to live in this file (a whole-text single-bucket
 * hash with no lexical structure at all). See `./deterministic.provider.ts`.
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
