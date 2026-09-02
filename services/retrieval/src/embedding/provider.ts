/**
 * EmbeddingProvider — the seam between "logic we own" and "a model we run".
 *
 * Two implementations ship with this skeleton and a third is expected:
 *
 *   DeterministicEmbeddingProvider  ceiling PF1  in-process, zero deps
 *   HttpEmbeddingProvider           ceiling PF2  real HTTP, contract-validated
 *   (yours)                         ceiling PF3  a real model
 *
 * The first two are NOT the kind of mock the repo's rule 5 forbids. A mock
 * pretends to be the thing and asserts nothing. These are real implementations
 * of a declared contract, each honest about its own ceiling (see
 * `evidence-tier.ts`), each with its own tests. The PF1 one computes real
 * vectors with real arithmetic; what it lacks is semantics, and it says so.
 */

import type { ProviderFidelity, FidelityRatedComponent } from "../evidence-tier.js";

/** Unit-length dense vector. Normalisation is part of the contract so callers can use dot product. */
export type Embedding = Float32Array;

export interface EmbeddingProvider extends FidelityRatedComponent {
  readonly dimensions: number;
  /**
   * Embeds a batch. Order of the result MUST match order of the input.
   * Batching is in the contract because it is the difference between one
   * round trip and N against a real model.
   */
  embed(texts: readonly string[]): Promise<readonly Embedding[]>;
}

export class EmbeddingError extends Error {
  override readonly name = "EmbeddingError";
}

export function assertDimensions(
  provider: EmbeddingProvider,
  vectors: readonly Embedding[],
): readonly Embedding[] {
  for (const [i, v] of vectors.entries()) {
    if (v.length !== provider.dimensions) {
      throw new EmbeddingError(
        `${provider.componentId} 回傳第 ${i} 個向量維度為 ${v.length},` +
          `與宣告的 ${provider.dimensions} 不符。維度不一致會讓相似度計算靜默給出錯誤排序。`,
      );
    }
  }
  return vectors;
}

/** Cosine similarity for unit vectors reduces to dot product; we assert rather than assume. */
export function dot(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) {
    throw new EmbeddingError(`向量維度不符:${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i]! * b[i]!;
  return sum;
}

export function normalise(vector: Float32Array): Float32Array {
  let magnitude = 0;
  for (let i = 0; i < vector.length; i += 1) magnitude += vector[i]! * vector[i]!;
  magnitude = Math.sqrt(magnitude);
  if (magnitude === 0) return vector;
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) out[i] = vector[i]! / magnitude;
  return out;
}

export const EMBEDDING_FIDELITY: Readonly<Record<string, ProviderFidelity>> = Object.freeze({
  deterministic: "PF1",
  http: "PF2",
});
