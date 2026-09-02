/**
 * `rerankMmr` (E04-S016) — pure-function tests. No store, no embedding
 * provider, no authorization: every fixture here is a hand-built
 * `RetrievalHit[]` so the arithmetic is exact and reviewable by hand.
 *
 * REVERSE-VERIFICATION NOTE (see EVIDENCE): "AC-MMR2 λ<1 產生比純相似度更
 * 多樣的結果" is the one load-bearing test in this file — it is the test that
 * must go RED when `rerankMmr` is degenerated to ignore `lambda` and always
 * behave as `lambda = 1`. The other tests intentionally do NOT provide that
 * signal on their own (AC-MMR1 stays green under a forced λ=1 because it
 * asks for λ=1 anyway; AC-MMR3/4/5 are permutation/subset/determinism
 * properties that hold regardless of how the ranking score is computed).
 */
import { describe, expect, it } from "vitest";

import { rerankMmr, candidatePoolSize, RerankError, DEFAULT_MMR_LAMBDA } from "./mmr.js";
import type { RetrievalHit } from "../vector/store.js";

const vec = (a: readonly number[]): Float32Array => Float32Array.from(a);

function hit(chunkId: string, score: number, embedding?: readonly number[]): RetrievalHit {
  return {
    chunkId,
    documentId: `doc-${chunkId}`,
    text: `text of ${chunkId}`,
    startOffset: 0,
    endOffset: 1,
    scopeKey: "dept:x",
    score,
    ...(embedding ? { embedding: vec(embedding) } : {}),
  };
}

// Three candidates: A and B point the same direction (near-duplicate
// content), C points orthogonally (a genuinely different topic). Pure
// similarity ranks purely by score: A (0.9) > B (0.85) > C (0.7).
const A = hit("chunk-a", 0.9, [1, 0]);
const B = hit("chunk-b", 0.85, [1, 0]);
const C = hit("chunk-c", 0.7, [0, 1]);

describe("rerankMmr — DEFAULT_MMR_LAMBDA is provisional", () => {
  it("is a named constant in [0, 1], not a magic number buried in an expression", () => {
    expect(DEFAULT_MMR_LAMBDA).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_MMR_LAMBDA).toBeLessThanOrEqual(1);
  });
});

describe("rerankMmr — AC-MMR1 (λ = 1 pins the degenerate case)", () => {
  it("at λ = 1, output is IDENTICAL to pure similarity ordering (order AND membership)", () => {
    const result = rerankMmr([A, B, C], 2, { lambda: 1 });
    // Pure similarity top-2 by score: A (0.9), B (0.85).
    expect(result.map((h) => h.chunkId)).toEqual(["chunk-a", "chunk-b"]);
    // Not merely equal chunkIds — the exact same objects, unmodified.
    expect(result[0]).toBe(A);
    expect(result[1]).toBe(B);
  });

  it("at λ = 1, candidates with no embedding at all still work — the redundancy term is never evaluated", () => {
    const noVectors = [hit("x", 0.3), hit("y", 0.9), hit("z", 0.6)];
    const result = rerankMmr(noVectors, 3, { lambda: 1 });
    expect(result.map((h) => h.chunkId)).toEqual(["y", "z", "x"]);
  });
});

describe("rerankMmr — AC-MMR2 (λ < 1 measurably diversifies WHICH documents come back)", () => {
  it("swaps out a near-duplicate for a genuinely different document, by chunk identity — not a self-computed diversity score", () => {
    const pureSimilarityTop2 = rerankMmr([A, B, C], 2, { lambda: 1 }).map((h) => h.chunkId);
    expect(pureSimilarityTop2).toEqual(["chunk-a", "chunk-b"]);

    const mmrTop2 = rerankMmr([A, B, C], 2, { lambda: 0.5 }).map((h) => h.chunkId);

    // The assertion is about WHICH chunks are returned: pure similarity keeps
    // the near-duplicate ("chunk-b", cosine 1.0 with "chunk-a"); MMR at
    // λ = 0.5 drops it in favour of the orthogonal, lower-score "chunk-c".
    expect(mmrTop2).toEqual(["chunk-a", "chunk-c"]);
    expect(mmrTop2).not.toEqual(pureSimilarityTop2);
    expect(mmrTop2).not.toContain("chunk-b");
  });

  it("the effect is monotonic in λ: high λ reverts to the pure ranking, lower λ diverges from it", () => {
    // Same A/B/C fixture. Worked out by hand (and pinned here): the
    // break-even point between keeping the near-duplicate "chunk-b" and
    // swapping in the orthogonal "chunk-c" sits at λ ≈ 0.8696 for these
    // exact numbers. Above it, MMR's second pick matches pure similarity;
    // at and below it, MMR's second pick diverges. This is not a boundary
    // this test invented — it falls out of λ·score − (1−λ)·redundancy.
    const highLambda = rerankMmr([A, B, C], 2, { lambda: 0.95 }).map((h) => h.chunkId);
    const lowLambda = rerankMmr([A, B, C], 2, { lambda: 0.5 }).map((h) => h.chunkId);

    expect(highLambda).toEqual(["chunk-a", "chunk-b"]); // matches pure similarity
    expect(lowLambda).toEqual(["chunk-a", "chunk-c"]); // diverges from it
    expect(lowLambda).not.toEqual(highLambda);
  });
});

describe("rerankMmr — AC-MMR3 (permutation-and-subset, never insertion)", () => {
  it("every returned hit is a reference from the input candidate set — nothing fabricated, nothing duplicated", () => {
    const pool = [
      hit("p1", 0.95, [1, 0, 0]),
      hit("p2", 0.5, [0, 1, 0]),
      hit("p3", 0.8, [0.7, 0.7, 0]),
      hit("p4", 0.3, [0, 0, 1]),
      hit("p5", 0.6, [0.5, 0.5, 0.5]),
      hit("p6", 0.9, [1, 0.1, 0]),
    ];
    const inputIds = new Set(pool.map((h) => h.chunkId));

    const result = rerankMmr(pool, 4, { lambda: 0.4 });

    expect(result).toHaveLength(4);
    const resultIds = result.map((h) => h.chunkId);
    // Subset: every id returned was in the input.
    for (const id of resultIds) expect(inputIds.has(id)).toBe(true);
    // No duplicates introduced.
    expect(new Set(resultIds).size).toBe(resultIds.length);
    // Identity, not reconstruction: each returned hit IS one of the input objects.
    for (const returned of result) {
      expect(pool).toContain(returned);
    }
  });

  it("candidate pool smaller than topK: returns everything available, does not pad or throw", () => {
    const small = [hit("only-1", 0.4, [1, 0]), hit("only-2", 0.9, [0, 1])];
    const result = rerankMmr(small, 5, { lambda: 0.5 });
    expect(result).toHaveLength(2);
    expect(new Set(result.map((h) => h.chunkId))).toEqual(new Set(["only-1", "only-2"]));
  });

  it("empty candidate pool returns empty, not an error", () => {
    expect(rerankMmr([], 5)).toEqual([]);
  });
});

describe("rerankMmr — AC-MMR4 (determinism, including ties)", () => {
  it("the same input produces the same order across repeated calls", () => {
    const pool = [
      hit("d1", 0.9, [1, 0]),
      hit("d2", 0.4, [0, 1]),
      hit("d3", 0.7, [0.5, 0.5]),
      hit("d4", 0.2, [1, 1]),
    ];
    const first = rerankMmr(pool, 3, { lambda: 0.5 }).map((h) => h.chunkId);
    const second = rerankMmr(pool, 3, { lambda: 0.5 }).map((h) => h.chunkId);
    expect(second).toEqual(first);
  });

  it("exact ties break deterministically by chunkId, ascending", () => {
    // "chunk-a" and "chunk-b" tie on score, embedding, and therefore mmrValue
    // at every step. Without an explicit tie-break, JS array order alone
    // would decide — this test pins the RULE, not an accident of iteration.
    const tiedA = hit("chunk-b-tied", 0.5, [1, 0]);
    const tiedB = hit("chunk-a-tied", 0.5, [1, 0]);
    // Deliberately fed in an order where the lexicographically LATER id
    // appears first in the input array, so a passing test cannot be
    // explained by "it just returned them in input order."
    const pool = [tiedA, tiedB];

    const run1 = rerankMmr(pool, 2, { lambda: 0.5 }).map((h) => h.chunkId);
    const run2 = rerankMmr(pool, 2, { lambda: 0.5 }).map((h) => h.chunkId);

    expect(run1).toEqual(["chunk-a-tied", "chunk-b-tied"]);
    expect(run2).toEqual(run1);
  });
});

describe("rerankMmr — validation", () => {
  it("rejects a non-positive topK", () => {
    expect(() => rerankMmr([A], 0)).toThrow(RerankError);
    expect(() => rerankMmr([A], -1)).toThrow(RerankError);
  });

  it("rejects lambda outside [0, 1]", () => {
    expect(() => rerankMmr([A, B], 1, { lambda: 1.5 })).toThrow(RerankError);
    expect(() => rerankMmr([A, B], 1, { lambda: -0.1 })).toThrow(RerankError);
  });

  it("λ < 1 with a candidate missing its embedding fails loudly rather than silently treating it as non-redundant", () => {
    const noEmbedding = hit("no-vec", 0.6);
    expect(() => rerankMmr([A, noEmbedding], 2, { lambda: 0.5 })).toThrow(RerankError);
  });
});

describe("candidatePoolSize", () => {
  it("always asks for MORE than topK, never exactly topK", () => {
    for (const topK of [1, 2, 4, 10, 50]) {
      expect(candidatePoolSize(topK)).toBeGreaterThan(topK);
    }
  });

  it("rejects a non-positive topK", () => {
    expect(() => candidatePoolSize(0)).toThrow(RerankError);
  });
});
