/**
 * `retrieveWithReranking` (E04-S016) — the candidate-pool composition
 * behaviour: does it actually ask the store for MORE than `topK`, and does
 * the whole thing degrade sanely when the pool comes back smaller than
 * `topK`? `mmr.test.ts` covers `rerankMmr` itself in isolation; this file
 * covers the seam that decides how big a pool `rerankMmr` gets to work with.
 */
import { describe, expect, it } from "vitest";

import { retrieveWithReranking } from "./retrieve-with-reranking.js";
import { candidatePoolSize, DEFAULT_CANDIDATE_POOL_MULTIPLIER, RerankError } from "./mmr.js";
import { createRetrievalService, createModelGatewayEmbeddingProvider } from "../service.js";
import type { RetrievalService } from "../service.js";
import { createInMemoryVectorStore, type RetrievalHit, type VectorRecord } from "../vector/store.js";
import { toRetrievalScope } from "../authorization/scope.js";
import type { CrossEncoderProvider } from "./cross-encoder.js";

const vec = (a: readonly number[]): Float32Array => Float32Array.from(a);

function hit(chunkId: string, score: number, embedding: readonly number[]): RetrievalHit {
  return {
    chunkId,
    documentId: `doc-${chunkId}`,
    text: `text of ${chunkId}`,
    startOffset: 0,
    endOffset: 1,
    scopeKey: "dept:x",
    score,
    embedding: vec(embedding),
  };
}

const scope = toRetrievalScope({ principalId: "u-test", allowedScopeKeys: ["dept:x"] });

/**
 * A `RetrievalService` fake that records the `topK` it was asked for and
 * returns a fixed, caller-controlled candidate set (truncated to that
 * `topK`, matching the REAL contract's own truncation — see `service.ts`).
 */
function fakeService(pool: readonly RetrievalHit[]): {
  service: RetrievalService;
  requestedTopKs: number[];
} {
  const requestedTopKs: number[] = [];
  const service: RetrievalService = {
    componentId: "retrieval:fake-for-test",
    fidelityCeiling: "PF1",
    async retrieve(_question, _scope, topK = 4) {
      requestedTopKs.push(topK);
      return pool.slice(0, topK);
    },
  };
  return { service, requestedTopKs };
}

describe("retrieveWithReranking — candidate pool (behaviour 5)", () => {
  it("asks the store for MORE candidates than the final topK — never exactly topK", async () => {
    const pool = [
      hit("a", 0.9, [1, 0]),
      hit("b", 0.85, [1, 0]),
      hit("c", 0.7, [0, 1]),
      hit("d", 0.6, [0, 1]),
      hit("e", 0.5, [1, 1]),
    ];
    const { service, requestedTopKs } = fakeService(pool);

    const topK = 2;
    await retrieveWithReranking(service, "問題", scope, topK);

    expect(requestedTopKs).toHaveLength(1);
    expect(requestedTopKs[0]).toBeGreaterThan(topK);
    expect(requestedTopKs[0]).toBe(candidatePoolSize(topK, DEFAULT_CANDIDATE_POOL_MULTIPLIER));
  });

  it("a candidate pool SMALLER than topK: returns only what is available, no padding, no throw", async () => {
    // Only 2 authorised chunks exist at all — the store cannot return more
    // than that no matter how large a pool retrieveWithReranking asks for.
    const pool = [hit("only-1", 0.4, [1, 0]), hit("only-2", 0.9, [0, 1])];
    const { service, requestedTopKs } = fakeService(pool);

    const topK = 5;
    const result = await retrieveWithReranking(service, "問題", scope, topK);

    // It DID ask for more than topK (the pool arithmetic ran normally)...
    expect(requestedTopKs[0]).toBeGreaterThan(topK);
    // ...but the store only had 2, so the result is exactly those 2 —
    // reranked, not padded to 5, not throwing because fewer came back.
    expect(result).toHaveLength(2);
    expect(new Set(result.map((h) => h.chunkId))).toEqual(new Set(["only-1", "only-2"]));
  });

  it("every result is a reference from the pre-rerank candidate set the store returned — permutation-and-subset, never insertion", async () => {
    const pool = [
      hit("a", 0.9, [1, 0]),
      hit("b", 0.85, [1, 0]),
      hit("c", 0.7, [0, 1]),
      hit("d", 0.6, [0.6, 0.8]),
      hit("e", 0.4, [0, 1]),
    ];
    const { service } = fakeService(pool);

    const topK = 3;
    const preRerankPoolSize = candidatePoolSize(topK);
    const preRerankSet = pool.slice(0, preRerankPoolSize);

    const result = await retrieveWithReranking(service, "問題", scope, topK, { lambda: 0.4 });

    expect(result.length).toBeLessThanOrEqual(topK);
    for (const returned of result) {
      expect(preRerankSet).toContain(returned); // same object, not a copy
    }
    expect(new Set(result.map((h) => h.chunkId)).size).toBe(result.length); // no duplicates
  });

  it("MMR's diversity-aware pick differs from pure similarity order — reranking actually ran (E04-S074)", async () => {
    // Three candidates, best-first by score (this is exactly what the store
    // itself would already hand back, and exactly what
    // `candidates.slice(0, topK)` would return unchanged):
    //   a  score 0.90  embedding [1, 0]
    //   b  score 0.85  embedding [1, 0]   <- near-duplicate of a
    //   c  score 0.70  embedding [0, 1]   <- orthogonal to a, i.e. diverse
    //
    // Pure similarity order (no reranking, i.e. `candidates.slice(0, topK)`
    // for topK=2) picks the two highest scores verbatim: [a, b].
    //
    // MMR at the DEFAULT lambda (0.5) does NOT: after picking `a` first (no
    // redundancy term yet, so relevance alone wins), the second pick scores
    //   b: 0.5*0.85 - 0.5*dot(b,a) = 0.425 - 0.5*1   = -0.075
    //   c: 0.5*0.70 - 0.5*dot(c,a) = 0.35  - 0.5*0   =  0.35
    // — `c` wins because `b` is fully redundant with the already-selected
    // `a` (dot == 1, same direction), while `c` is orthogonal to it (dot ==
    // 0). So a correctly-wired MMR call returns [a, c], not [a, b].
    //
    // This is the assertion `candidatePoolSize`/scope/length checks above
    // cannot catch: deleting the `rerankMmr` call (E04-S074's defect —
    // `return candidates.slice(0, topK)` instead) still returns 2 results,
    // still within scope, still a subset of the pool — it just silently
    // returns [a, b] instead of [a, c]. Only an assertion on WHICH chunks
    // were selected can tell the two apart.
    const pool = [hit("a", 0.9, [1, 0]), hit("b", 0.85, [1, 0]), hit("c", 0.7, [0, 1])];
    const { service } = fakeService(pool);

    const topK = 2;
    const result = await retrieveWithReranking(service, "問題", scope, topK);

    expect(result.map((h) => h.chunkId)).toEqual(["a", "c"]);
  });
});

describe("retrieveWithReranking — end-to-end against the real service and store (never widens the authorized set)", () => {
  it("reranks WITHIN scope only: no result outside allowedScopeKeys, and every result was in the store's own authorised candidate set", async () => {
    const store = createInMemoryVectorStore();
    const embedding = createModelGatewayEmbeddingProvider({ dimensions: 32 });

    const maintenanceTexts = [
      "泵浦異常處理程序。當離心泵出現軸承過熱時,應先停機並記錄運轉時數。",
      "軸承溫度超過攝氏八十度視為異常。潤滑油每運轉兩千小時更換一次。",
      "軸承過熱的第二種常見原因是潤滑油老化,需依排程更換,不可延後。",
      "馬達異音檢查程序:先確認軸承潤滑狀態,再檢查皮帶張力。",
    ];
    const financeText = "年度預算編列作業要點。資本支出超過新台幣五百萬元者,須經董事會核准後方可執行。";

    const vectors = await embedding.embed([...maintenanceTexts, financeText]);
    const records: VectorRecord[] = [
      ...maintenanceTexts.map((text, i) => ({
        chunkId: `maint-${i}`,
        documentId: "doc-maintenance-001",
        text,
        startOffset: 0,
        endOffset: text.length,
        scopeKey: "dept:maintenance",
        embedding: vectors[i]!,
      })),
      {
        chunkId: "fin-0",
        documentId: "doc-finance-001",
        text: financeText,
        startOffset: 0,
        endOffset: financeText.length,
        scopeKey: "dept:finance",
        embedding: vectors[maintenanceTexts.length]!,
      },
    ];
    await store.upsert(records);

    const service: RetrievalService = createRetrievalService({ store, embedding, enforceEmbeddingVersion: false });
    const maintenanceScope = toRetrievalScope({
      principalId: "u-alice",
      allowedScopeKeys: ["dept:maintenance"],
    });

    // Ground truth: what the REAL retrieve() itself considers the authorised
    // candidate set at the pool size retrieveWithReranking will request.
    const topK = 2;
    const poolSize = candidatePoolSize(topK);
    const authorisedCandidates = await service.retrieve("軸承過熱", maintenanceScope, poolSize);
    const authorisedIds = new Set(authorisedCandidates.map((h) => h.chunkId));

    const reranked = await retrieveWithReranking(service, "軸承過熱", maintenanceScope, topK, {
      lambda: 0.5,
    });

    expect(reranked.length).toBeLessThanOrEqual(topK);
    expect(reranked.length).toBeGreaterThan(0);
    for (const hit of reranked) {
      // Never widens the authorized set: no finance chunk, ever.
      expect(hit.scopeKey).toBe("dept:maintenance");
      expect(hit.documentId).not.toBe("doc-finance-001");
      // Permutation-and-subset against the real store's own authorised output.
      expect(authorisedIds.has(hit.chunkId)).toBe(true);
    }
  });
});

/**
 * `retrieveWithReranking` + a cross-encoder (E04-S089, ADR 0009 D3). These
 * tests are ADDITIONS to this already-frozen file (`STORY_WORKFLOW.md`
 * Phase 2: test content only grows, existing assertions above are untouched
 * — every one of them still passes with `options.crossEncoder` omitted,
 * exactly as before this stage existed).
 *
 * Mirrors the shape of the "MMR's diversity-aware pick differs..." test
 * above (E04-S074), which proved `rerankMmr` itself was actually being
 * called. This block proves the SAME thing one stage earlier: that a
 * supplied cross-encoder's scores actually drive the final order, not just
 * "get called and get ignored". A fake (not HTTP) `CrossEncoderProvider` is
 * used throughout — `cross-encoder-http.provider.test.ts` covers the real
 * HTTP adapter's own contract (index realignment, truncation, error
 * mapping) against a fake `fetch`; this file only cares about the
 * composition seam.
 */
describe("retrieveWithReranking — cross-encoder relevance stage (E04-S089)", () => {
  function fakeCrossEncoder(scoreForText: (text: string) => number): {
    crossEncoder: CrossEncoderProvider;
    calls: Array<{ question: string; passages: readonly string[] }>;
  } {
    const calls: Array<{ question: string; passages: readonly string[] }> = [];
    const crossEncoder: CrossEncoderProvider = {
      componentId: "cross-encoder:fake-for-test",
      fidelityCeiling: "PF1",
      model: "fake",
      async score(question, passages) {
        calls.push({ question, passages });
        return passages.map((text) => {
          const relevanceScore = scoreForText(text);
          return { relevanceScore, rawScore: relevanceScore, truncated: false };
        });
      },
    };
    return { crossEncoder, calls };
  }

  it("the cross-encoder's relevance score actually drives the final order — not the dense score, and not just 'called and ignored' (reranking actually ran)", async () => {
    // Dense pass ranks "a" above "b" (score 0.9 vs 0.1). The cross-encoder
    // DISAGREES, scoring b's own text far higher. At lambda=1 (pure
    // relevance, no MMR redundancy tradeoff — isolates this assertion to
    // the cross-encoder stage alone) a correctly-wired pipeline must flip
    // the order to [b, a]. Bypassing the cross-encoder call (mutation a) or
    // collapsing its scores to one constant (mutation c, which degenerates
    // to the chunkId tie-break and yields [a, b] — "a" sorts first) both
    // land back on [a, b], which this assertion catches.
    const pool = [hit("a", 0.9, [1, 0]), hit("b", 0.1, [0, 1])];
    const { service } = fakeService(pool);
    const { crossEncoder, calls } = fakeCrossEncoder((text) => (text === "text of b" ? 0.95 : 0.05));

    const topK = 2;
    const result = await retrieveWithReranking(service, "問題", scope, topK, {
      crossEncoder,
      lambda: 1,
    });

    expect(result.map((h) => h.chunkId)).toEqual(["b", "a"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.question).toBe("問題");
    // The composition passes candidate TEXTS in candidate order — the
    // cross-encoder's OWN contract (see cross-encoder.ts) is what promises
    // score(i) <-> passages[i]; this just confirms the composition upholds
    // its half (sending them in order) rather than shuffling before asking.
    expect(calls[0]!.passages).toEqual(["text of a", "text of b"]);
  });

  it("omitting crossEncoder is IDENTICAL to the pre-E04-S089 pipeline — dense score straight into MMR, unchanged", async () => {
    const pool = [hit("a", 0.9, [1, 0]), hit("b", 0.1, [0, 1])];
    const { service } = fakeService(pool);

    const result = await retrieveWithReranking(service, "問題", scope, 2, { lambda: 1 });

    // No cross-encoder supplied: dense order wins — the mirror image of the
    // test above, proving the default really is "skip the new stage", not
    // some other silently-different behaviour.
    expect(result.map((h) => h.chunkId)).toEqual(["a", "b"]);
  });

  it("a cross-encoder that collapses every score to the SAME constant does not silently reproduce a relevance-driven order — it degenerates to the tie-break", async () => {
    const pool = [hit("a", 0.9, [1, 0]), hit("b", 0.1, [0, 1])];
    const { service } = fakeService(pool);
    const { crossEncoder } = fakeCrossEncoder(() => 0.5); // every passage scores identically

    const result = await retrieveWithReranking(service, "問題", scope, 2, { crossEncoder, lambda: 1 });

    // All scores tied -> mmr.ts's deterministic tie-break (lexicographically
    // smaller chunkId wins) decides the order, NOT any notion of relevance —
    // "a" < "b" lexically, so this differs from the disagreeing-scores test
    // above ([b, a]), proving a constant-score cross-encoder is
    // distinguishable from a working one on the ONLY thing that matters
    // here: the resulting order.
    expect(result.map((h) => h.chunkId)).toEqual(["a", "b"]);
  });

  it("rejects a cross-encoder that returns the wrong number of scores — never silently zips a mismatched array positionally", async () => {
    const pool = [hit("a", 0.9, [1, 0]), hit("b", 0.1, [0, 1])];
    const { service } = fakeService(pool);
    const crossEncoder: CrossEncoderProvider = {
      componentId: "cross-encoder:broken-fake",
      fidelityCeiling: "PF1",
      model: "fake",
      async score() {
        return [{ relevanceScore: 1, rawScore: 1, truncated: false }]; // 1 score, 2 candidates sent
      },
    };

    await expect(retrieveWithReranking(service, "問題", scope, 2, { crossEncoder })).rejects.toThrow(
      RerankError,
    );
  });

  it("end-to-end: cross-encoder relevance feeds into MMR's redundancy tradeoff too, not just a pre-sort — matches the target 3-stage pipeline (dense -> cross-encoder -> MMR)", async () => {
    // Three candidates: a and b are near-duplicate embeddings, c is
    // orthogonal (diverse). Dense scores would pick [a, b] at topK=2
    // (E04-S074's own fixture). Here the cross-encoder scores ALL THREE
    // equally relevant — so with lambda=0.5, MMR's redundancy term (which
    // reads the REPLACED .score for the relevance half of its formula, at
    // an equal 0.5 for all three) must still prefer the diverse `c` over
    // the redundant `b` for the second pick, exactly mirroring E04-S074's
    // own reasoning but now downstream of a cross-encoder pass instead of
    // the raw dense score.
    const pool = [hit("a", 0.9, [1, 0]), hit("b", 0.85, [1, 0]), hit("c", 0.7, [0, 1])];
    const { service } = fakeService(pool);
    const { crossEncoder } = fakeCrossEncoder(() => 0.5); // cross-encoder finds them equally relevant

    const result = await retrieveWithReranking(service, "問題", scope, 2, { crossEncoder, lambda: 0.5 });

    expect(result.map((h) => h.chunkId)).toEqual(["a", "c"]);
  });
});
