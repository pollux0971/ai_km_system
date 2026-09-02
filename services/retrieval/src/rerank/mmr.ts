/**
 * Basic reranking — E04-S016.
 *
 * `SOURCE_BASELINE.md` §17 marks E04-S16 as "MVP = Basic, GA = Dedicated
 * reranker" and §10 Principle 2 draws Reranking as its OWN pipeline stage,
 * sitting between Retrieval and Context Builder — not fused into either.
 *
 * ── MMR IS THE DEFAULT IMPLEMENTATION, ADJUSTABLE (user decision, 2026-09-02) ──
 *
 * This is a PROPOSAL for the Basic tier, not a settled answer. The user chose
 * Maximal Marginal Relevance — trading relevance against redundancy using the
 * similarity scores and vectors retrieval already computes — specifically
 * because it needs no model, no extra embedding call and no cross-encoder:
 *
 *   MMR(d) = λ · sim(query, d) − (1 − λ) · max_{s ∈ selected} sim(d, s)
 *
 * `sim(query, d)` is `RetrievalHit.score` — already computed by whichever
 * `VectorStore` produced the candidate set, not recomputed here. `sim(d, s)`
 * is the dot product of the two chunks' OWN embeddings (`RetrievalHit.
 * embedding`) — vectors the store already holds, reused, not a new model
 * call. At λ = 1 the redundancy term is multiplied by zero and MMR
 * degenerates exactly to the store's own similarity ordering; this is
 * asserted by a test (`mmr.test.ts`, "λ = 1 pins the degenerate case") rather
 * than left as an informal claim.
 *
 * If a later story swaps this for a dedicated/cross-encoder reranker (the GA
 * tier §17 names), it replaces the body of `rerankMmr` (or sits behind the
 * same `RerankOptions` seam) — nothing upstream needs to change, because
 * reranking is deliberately kept as its own step (see this file's header vs.
 * `service.ts`'s `retrieve()`, which is intentionally NOT changed by this
 * story).
 */

import { dot, type Embedding } from "../embedding/provider.js";
import type { RetrievalHit } from "../vector/store.js";

export class RerankError extends Error {
  override readonly name = "RerankError";
}

/**
 * λ ∈ [0, 1] — THE PRODUCT DECISION THIS STORY DOES NOT MAKE (registered as
 * `(d5)`).
 *
 * λ trades relevance (λ → 1) against diversity (λ → 0), and which trade-off
 * is right for this product is not an engineering question — it depends on
 * how much duplicate/near-duplicate content the corpus actually has and how
 * much the user is willing to sacrifice top-1 relevance for coverage. That is
 * a call for the user, not something to bury in an expression.
 *
 * `0.5` is picked here ONLY as a defensible, literature-typical starting
 * point (an even split between the two terms — neither term is presumed to
 * dominate) so the Basic tier has *a* working default while the real ruling
 * is pending. It is a NAMED, DOCUMENTED, INJECTABLE constant precisely so
 * nothing downstream has to guess it out of a raw `0.5` in the middle of an
 * expression, and so the eventual user ruling is a one-line change here (or a
 * per-call override via `RerankOptions.lambda`), not a code archaeology
 * exercise.
 *
 * PROVISIONAL. Awaiting a user ruling. Do not treat `0.5` as final.
 */
export const DEFAULT_MMR_LAMBDA = 0.5;

/**
 * How many extra candidates the caller should fetch from the store beyond
 * the final `topK`, so MMR has something to diversify among (see
 * `retrieve-with-reranking.ts`'s header for why this cannot be `1`). Not a
 * product decision the way `DEFAULT_MMR_LAMBDA` is — this is a plain
 * engineering trade-off between "MMR has more room to diversify" and
 * "the store scores/returns more candidates than we will ever use" — but it
 * is still named and injectable rather than a bare literal, for the same
 * reason.
 */
export const DEFAULT_CANDIDATE_POOL_MULTIPLIER = 3;

/**
 * Floor added on top of `topK * DEFAULT_CANDIDATE_POOL_MULTIPLIER` so a small
 * `topK` (e.g. 1) still asks for a handful of extra candidates rather than a
 * pool of literally `topK * multiplier` (which could round to `topK` itself
 * for small `topK` and silently turn MMR into a no-op — exactly the failure
 * mode this story is required to guard against).
 */
export const MIN_CANDIDATE_POOL_OVERFETCH = 4;

export interface RerankOptions {
  /**
   * Overrides `DEFAULT_MMR_LAMBDA` for this call. Still provisional — see
   * `DEFAULT_MMR_LAMBDA`'s docstring. Must be in `[0, 1]`.
   */
  readonly lambda?: number;
}

/**
 * Computes the candidate pool size a caller should request from the store
 * for a given final `topK`, using `DEFAULT_CANDIDATE_POOL_MULTIPLIER` and
 * `MIN_CANDIDATE_POOL_OVERFETCH`. Exported so the composition helper
 * (`retrieve-with-reranking.ts`) and tests share exactly one definition of
 * "enough candidates to diversify among" instead of two that can drift.
 */
export function candidatePoolSize(
  topK: number,
  multiplier: number = DEFAULT_CANDIDATE_POOL_MULTIPLIER,
): number {
  if (!Number.isInteger(topK) || topK <= 0) {
    throw new RerankError(`topK 必須是正整數,收到 ${topK}。`);
  }
  if (!Number.isFinite(multiplier) || multiplier < 1) {
    throw new RerankError(`candidate pool multiplier 必須 >= 1,收到 ${multiplier}。`);
  }
  return Math.max(Math.ceil(topK * multiplier), topK + MIN_CANDIDATE_POOL_OVERFETCH);
}

function requireEmbedding(hit: RetrievalHit, role: "candidate" | "selected"): Embedding {
  if (!hit.embedding) {
    throw new RerankError(
      `chunk ${hit.chunkId} 沒有 embedding,MMR 無法計算它與已選結果的冗餘度` +
        `(role=${role})。這個 VectorStore 實作必須在 RetrievalHit 上帶回向量才能重排——` +
        `純相關性排序(λ=1)不需要這個,但 λ<1 一定需要,不能靜默當作「不冗餘」處理。`,
    );
  }
  return hit.embedding;
}

/**
 * Reranks an ALREADY scope-filtered candidate set by Maximal Marginal
 * Relevance, returning at most `topK` of them, best-first.
 *
 * CONTRACT — permutation-and-subset, NEVER insertion:
 *  - Every element of the result is a reference to an element of `candidates`
 *    (same object identity; nothing is copied, constructed or synthesised).
 *  - The result never contains a chunk absent from `candidates`.
 *  - `result.length === Math.min(topK, candidates.length)`.
 *
 * This function does not call the store, the embedding provider, or
 * `retrieve()` — it is a pure function of the candidate list it is given, so
 * it can be tested in complete isolation from authorization, the store, and
 * the model gateway.
 *
 * At `lambda = 1` the redundancy term is never evaluated (its coefficient is
 * `1 - lambda = 0`), so a candidate set with NO embeddings at all still works
 * at `lambda = 1` — this mirrors "pure similarity ranking needs no vectors,
 * only scores," and lets a store that cannot yet supply embeddings keep
 * working at the degenerate setting.
 */
export function rerankMmr(
  candidates: readonly RetrievalHit[],
  topK: number,
  options: RerankOptions = {},
): readonly RetrievalHit[] {
  if (!Number.isInteger(topK) || topK <= 0) {
    throw new RerankError(`topK 必須是正整數,收到 ${topK}。`);
  }
  const lambda = options.lambda ?? DEFAULT_MMR_LAMBDA;
  if (!Number.isFinite(lambda) || lambda < 0 || lambda > 1) {
    throw new RerankError(`lambda 必須落在 [0, 1],收到 ${lambda}。`);
  }

  const remaining = candidates.slice();
  const selected: RetrievalHit[] = [];
  const wantCount = Math.min(topK, remaining.length);

  while (selected.length < wantCount) {
    let bestIndex = -1;
    let bestValue = -Infinity;

    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i]!;
      const relevance = candidate.score;

      let redundancy = 0;
      if (lambda < 1 && selected.length > 0) {
        const candidateEmbedding = requireEmbedding(candidate, "candidate");
        let maxSimilarity = -Infinity;
        for (const already of selected) {
          const selectedEmbedding = requireEmbedding(already, "selected");
          maxSimilarity = Math.max(maxSimilarity, dot(candidateEmbedding, selectedEmbedding));
        }
        redundancy = maxSimilarity;
      }

      const mmrValue = lambda * relevance - (1 - lambda) * redundancy;

      // Deterministic tie-break: strictly greater wins; on an EXACT tie,
      // prefer the lexicographically smaller chunkId. Without this, two
      // candidates with identical mmrValue would be ordered by array scan
      // order, which is an accident of `candidates`' own input order rather
      // than a property of the algorithm — determinism (behaviour 4) needs a
      // rule that does not depend on that accident.
      if (
        mmrValue > bestValue ||
        (mmrValue === bestValue &&
          bestIndex !== -1 &&
          candidate.chunkId.localeCompare(remaining[bestIndex]!.chunkId) < 0)
      ) {
        bestIndex = i;
        bestValue = mmrValue;
      }
    }

    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push(chosen!);
  }

  return selected;
}
