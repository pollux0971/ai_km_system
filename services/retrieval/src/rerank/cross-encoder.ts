/**
 * `CrossEncoderProvider` — the seam between "logic we own" and a REAL
 * relevance model (ADR 0009 D3, `models/rerank/README.md`).
 *
 * ── WHAT THIS ADDS, AND WHAT IT DOES NOT REPLACE ────────────────────────────
 *
 * `rerank/mmr.ts`'s `rerankMmr` trades relevance against diversity using
 * `RetrievalHit.score` — the dense store's own cosine/dot-product similarity.
 * It never calls a model and it does not improve relevance: if the dense
 * ordering is wrong, MMR just spreads the wrong ordering out more evenly.
 *
 * A cross-encoder is different in kind, not degree: it feeds `(query,
 * passage)` INTO one model TOGETHER and reads out a purpose-built relevance
 * score, instead of comparing two independently-computed embeddings. That is
 * the stage this file's contract describes. `rerank/retrieve-with-
 * reranking.ts` is what wires it in AS A NEW STAGE ahead of `rerankMmr`, not
 * as a replacement for it — see that file's header for the composition.
 *
 * ── THE TRAP THIS CONTRACT IS DESIGNED TO MAKE IMPOSSIBLE (ADR 0009, E04-S087)
 *
 * `models/rerank/README.md` measured the real llama.cpp `/rerank` endpoint:
 * its `results` array comes back SORTED BY SCORE, descending — NOT in input
 * order — and `results[i].index` is the only field that says which element
 * of the ORIGINAL `documents` array a given score belongs to. A client that
 * zips `results` positionally against its own passage array (`results[i]` <->
 * `passages[i]`) silently hands every passage somebody else's score. The
 * pipeline still returns `topK` results, still all drawn from the authorised
 * candidate set, still looking entirely plausible — it is simply reordering
 * by the wrong numbers. Nothing throws.
 *
 * This interface's contract closes that trap AT THE TYPE BOUNDARY: `score()`
 * MUST return an array aligned to the ORDER OF ITS OWN `passages` argument —
 * `result[i]` is always the score for `passages[i]`, regardless of what
 * order (if any) the underlying model or HTTP response uses. Whatever
 * implementation talks to the real server (`cross-encoder-http.provider.ts`)
 * is responsible for doing that de-scrambling ONCE, in one well-tested place,
 * so every caller of this interface is structurally protected rather than
 * merely warned in a comment.
 */

import type { FidelityRatedComponent, ProviderFidelity } from "../evidence-tier.js";

export interface CrossEncoderScore {
  /**
   * `sigmoid(rawScore)`, mapped into `(0, 1)`. Use this whenever a relevance
   * value needs to be compared, thresholded, or mixed with another [0,1]-ish
   * quantity — `rawScore` is an unbounded logit and comparing it against a
   * probability-shaped threshold is meaningless.
   */
  readonly relevanceScore: number;
  /**
   * The model's own raw output, UNMAPPED. `models/rerank/README.md` §④
   * measured this llama.cpp endpoint returning raw logits (observed range
   * roughly -11.02 to 6.48), not a sigmoid-ed probability — kept here for
   * inspection/debugging, never for thresholding.
   */
  readonly rawScore: number;
  /**
   * `true` when this passage's text had to be shortened before scoring
   * because `query + passage` did not fit the model's token budget (ADR
   * 0009 R2 / `models/rerank/README.md`'s `max_length = 512` warning). The
   * score is still a real model output, just computed over less text than
   * the caller originally supplied — callers that care can surface this
   * rather than silently trusting a score computed on truncated content.
   */
  readonly truncated: boolean;
}

export interface CrossEncoderProvider extends FidelityRatedComponent {
  readonly model: string;
  /**
   * Scores every one of `passages` against `query`. The result has EXACTLY
   * `passages.length` entries and `result[i]` is ALWAYS the score for
   * `passages[i]` — see this file's header for why that alignment is the
   * entire point of this interface, not an implementation detail.
   *
   * `passages.length === 0` returns `[]` without making any call — there is
   * nothing to score and no server round trip should be attributed to it.
   */
  score(query: string, passages: readonly string[]): Promise<readonly CrossEncoderScore[]>;
}

export class CrossEncoderError extends Error {
  override readonly name = "CrossEncoderError";
}

/**
 * `1 / (1 + e^-x)` — maps an unbounded logit into `(0, 1)`. Exported and
 * tested standalone (see `cross-encoder.test.ts`) because
 * `models/rerank/README.md` §④'s conclusion ("this endpoint returns raw
 * logits, not sigmoid-ed values") is exactly the kind of claim this repo's
 * rules require to be backed by a runnable check, not just prose.
 */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Mirrors `embedding/provider.ts`'s `EMBEDDING_FIDELITY` convention: "http"
 * means a real network call to a real model server, capped at PF2 because
 * PF3 additionally requires a fixed evaluation set backing the claim (see
 * `evidence-tier.ts`) — a real model behind a real socket is necessary for
 * PF3 but not sufficient for it.
 */
export const CROSS_ENCODER_FIDELITY: Readonly<Record<string, ProviderFidelity>> = Object.freeze({
  http: "PF2",
});
