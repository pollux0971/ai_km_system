/**
 * Composes `RetrievalService.retrieve()`, an OPTIONAL `CrossEncoderProvider`
 * relevance pass, and `rerankMmr()` — the seam a caller uses to get a
 * reranked result set without doing the candidate-pool arithmetic itself.
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
 * ── THE CROSS-ENCODER STAGE (ADR 0009 D3, E04-S089) ─────────────────────────
 *
 * `sim(query, d)` used to never need recomputing here: it was already
 * `RetrievalHit.score`, produced once by `retrieve()`'s dense pass, and this
 * function never called a model a second time.
 *
 * That is now OPTIONAL, not removed: when `options.crossEncoder` is supplied,
 * every dense candidate is re-scored by the cross-encoder — a real relevance
 * model that reads `(query, passage)` TOGETHER, unlike the dense pass's two
 * independently-computed embeddings — and `rerankMmr`'s `sim(query, d)` term
 * (i.e. `RetrievalHit.score`) is REPLACED with that relevance score before
 * MMR ever runs. The target pipeline is therefore three stages, in order:
 *
 *   dense retrieve (large pool) -> cross-encoder rerank (relevance)
 *     -> MMR (diversity, down to topK)
 *
 * `options.crossEncoder` is OPTIONAL — defaulting to "skip this stage,
 * behave exactly as before" — for a reason that is a direct consequence of
 * this repo's own rules, not a design preference: `STORY_WORKFLOW.md`'s
 * Phase 2 forbids a dev agent from modifying existing test content to fit a
 * new implementation, and `retrieve-with-reranking.test.ts`'s five
 * already-frozen tests call this function with NO cross-encoder concept at
 * all, asserting an exact MMR-only order (`["a", "c"]`) computed from
 * hand-picked dense `.score` values. Making this stage unconditional would
 * silently invalidate those pinned expectations the moment a test's fake
 * `RetrievalService` candidates got re-scored by whatever this defaulted to.
 * An optional, explicitly-injected provider — mirroring how `service.ts`'s
 * `RetrievalServiceOptions.embedding` is itself injectable — keeps every
 * existing test's behaviour byte-for-byte unchanged while making the new
 * stage a first-class, fully-wired part of this function for any caller
 * (real or test) that supplies a provider. The real composition root that
 * eventually calls this in production (not yet written — this package's
 * `retrieveWithReranking` has no caller outside its own test file yet, see
 * `index.ts`) is expected to always pass one; omitting it is a deliberate
 * escape hatch for exactly the callers — this file's own pre-existing tests
 * — that predate this stage's existence, not a silent default for new ones.
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
import { RerankError } from "./mmr.js";
import type { CrossEncoderProvider } from "./cross-encoder.js";

export interface RetrieveWithRerankingOptions extends RerankOptions {
  /** Overrides `DEFAULT_CANDIDATE_POOL_MULTIPLIER` for this call. */
  readonly poolMultiplier?: number;
  /**
   * When supplied, every dense candidate is re-scored by this cross-encoder
   * BEFORE `rerankMmr` runs (see this file's header, "THE CROSS-ENCODER
   * STAGE"). Omitted (the default): this function behaves exactly as it did
   * before this stage existed — dense score straight into MMR.
   */
  readonly crossEncoder?: CrossEncoderProvider;
}

/**
 * Re-scores `candidates` against `question` using `crossEncoder`, returning
 * NEW `RetrievalHit` objects whose `.score` is the cross-encoder's
 * `relevanceScore` — every other field (`chunkId`, `text`, `embedding`, ...)
 * is carried over unchanged, so `rerankMmr`'s redundancy term (which reads
 * `.embedding`, untouched by this stage) keeps working exactly as before.
 *
 * `crossEncoder.score()`'s own contract (see `cross-encoder.ts`) guarantees
 * `scores[i]` is the score for `candidates[i]` — this function trusts that
 * alignment for the zip below, but still asserts the lengths match as a
 * defence against a provider that silently violates its own contract.
 */
async function applyCrossEncoder(
  crossEncoder: CrossEncoderProvider,
  question: string,
  candidates: readonly RetrievalHit[],
): Promise<readonly RetrievalHit[]> {
  if (candidates.length === 0) return candidates;

  const scores = await crossEncoder.score(
    question,
    candidates.map((hit) => hit.text),
  );
  if (scores.length !== candidates.length) {
    throw new RerankError(
      `cross-encoder (${crossEncoder.componentId}) 回傳 ${scores.length} 筆分數,` +
        `與候選數 ${candidates.length} 不符——不得用位置猜測對應關係,拒絕繼續重排。`,
    );
  }

  return candidates.map((hit, i) => ({ ...hit, score: scores[i]!.relevanceScore }));
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
  const relevanceRanked = options.crossEncoder
    ? await applyCrossEncoder(options.crossEncoder, question, candidates)
    : candidates;

  return rerankMmr(relevanceRanked, topK, options);
}
