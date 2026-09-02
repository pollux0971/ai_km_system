/**
 * Composes `RetrievalService.retrieve()` with `rerankMmr()` — the seam a
 * caller uses to get a reranked result set without doing the candidate-pool
 * arithmetic itself.
 *
 * ── WHY THIS SITS BESIDE `retrieve()` INSTEAD OF INSIDE IT ──────────────────
 *
 * `retrieve()` (`../service.ts`) already has a FROZEN contract: given a
 * `topK`, it returns exactly that many of the store's own best-first hits.
 * `service.test.ts`'s AC-R1 pins this literally — it asserts the returned
 * `score`s come back in descending order. MMR reranking, by design, does NOT
 * preserve strict score order (that is the entire point of trading relevance
 * for diversity), so baking it into `retrieve()` unconditionally would
 * silently break that frozen assertion — exactly the kind of "modify an
 * existing test to fit the new implementation" move `STORY_WORKFLOW.md`
 * Phase 2/4 forbids. `retrieve()` is therefore left untouched by this story.
 *
 * §10 Principle 2 also draws Reranking as its OWN pipeline stage (Retrieval →
 * Reranking → Context Builder), not a hidden option inside Retrieval — a
 * separate, explicitly-composed step matches that shape more directly than a
 * flag threaded into `retrieve()` would.
 *
 * ── THE CANDIDATE POOL ───────────────────────────────────────────────────────
 *
 * `retrieve()` returns AT MOST `topK` hits, already truncated by the store.
 * If this function asked for exactly `topK` and reranked those, MMR would
 * have nothing left to diversify among — it would only ever reorder the same
 * `topK` items the store already picked, which is a no-op in every case that
 * matters (the whole set gets selected regardless of `lambda`). So this
 * function asks the store for `candidatePoolSize(topK)` — strictly more than
 * `topK` (see `mmr.ts`) — and reranks THAT pool down to `topK`. Getting this
 * wrong (asking for exactly `topK`) is the specific silent-no-op failure mode
 * this story was warned against; `retrieve-with-reranking.test.ts` pins the
 * pool size actually requested so a future edit cannot quietly regress it
 * back to `topK`.
 *
 * If the store (because of scope restrictions, or a small corpus) returns
 * FEWER than the requested pool size — even fewer than `topK` — this function
 * does not pad, retry or widen the scope. `rerankMmr` returns whatever is
 * available, permutation-and-subset, same as always.
 *
 * `sim(query, d)` never needs recomputing here: it is already `RetrievalHit.
 * score`, produced once by `retrieve()`. This function does not call the
 * embedding provider a second time.
 */

import type { RetrievalService } from "../service.js";
import type { RetrievalScope } from "../authorization/scope.js";
import type { RetrievalHit } from "../vector/store.js";
import {
  rerankMmr,
  candidatePoolSize,
  DEFAULT_CANDIDATE_POOL_MULTIPLIER,
  type RerankOptions,
} from "./mmr.js";

export interface RetrieveWithRerankingOptions extends RerankOptions {
  /** Overrides `DEFAULT_CANDIDATE_POOL_MULTIPLIER` for this call. */
  readonly poolMultiplier?: number;
}

export async function retrieveWithReranking(
  service: RetrievalService,
  question: string,
  scope: RetrievalScope,
  topK: number,
  options: RetrieveWithRerankingOptions = {},
): Promise<readonly RetrievalHit[]> {
  const poolMultiplier = options.poolMultiplier ?? DEFAULT_CANDIDATE_POOL_MULTIPLIER;
  const poolSize = candidatePoolSize(topK, poolMultiplier);

  const candidates = await service.retrieve(question, scope, poolSize);
  return rerankMmr(candidates, topK, options);
}
