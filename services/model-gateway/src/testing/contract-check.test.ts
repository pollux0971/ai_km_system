/**
 * `expectResponseMatchesContract` (model-gateway's own copy) — relocated
 * assertions from `@ai-km/rag-skeleton`'s
 * `tests/fake-server-contract.integration.test.ts` (E04-S064, retiring the
 * skeleton).
 *
 * `services/model-gateway/src/routes/model-gateway-routes.test.ts` calls this
 * function on every route test (AC-R2/R3/R4/R5/R9/R10/R11), but a grep found
 * no test proving the function itself can ever return red — every existing
 * call site happens to pass a body the schema accepts, or a body the gateway
 * itself already rejected upstream. A schema check that has never been shown
 * to fail is not a gate; it is decoration that happens to agree with
 * well-formed input. This file proves both directions:
 *
 *  - AC-C7 (relocated): the validator itself goes red on all four constraint
 *    shapes `embedding.yaml` actually declares (`additionalProperties:
 *    false`, wrong wire shape for a vector, `minimum`, `minItems`).
 *  - AC-C6 (relocated): the validator does NOT catch a fabricated citation —
 *    every field on a `Citation` is a plain string/number, so a citation
 *    naming a chunk that was never supplied is structurally indistinguishable
 *    from a real one. Recorded as a test, not a comment, so nobody concludes
 *    schema conformance makes `assertCitationsGrounded` redundant.
 */
import { describe, expect, it } from "vitest";
import { expectResponseMatchesContract, loadContract } from "./contract-check.js";

describe("expectResponseMatchesContract — embedding.yaml (relocated rag-skeleton AC-C7)", () => {
  it("AC-C7 (PF0) 驗證器本身會紅 —— 未被證明會失敗的驗證器不是驗證器", async () => {
    const contract = await loadContract("embedding");

    // additionalProperties: false — a field the contract does not define.
    expect(() =>
      expectResponseMatchesContract(contract, "/embeddings", "post", 200, {
        model: "x",
        dimensions: 2,
        data: [{ index: 0, embedding: [0.1, 0.2] }],
        scopeKey: "dept:finance",
      }),
    ).toThrow(/不符合契約/);

    // A Float32Array serialised the wrong way: an object, not an array.
    expect(() =>
      expectResponseMatchesContract(contract, "/embeddings", "post", 200, {
        model: "x",
        dimensions: 2,
        data: [{ index: 0, embedding: { "0": 0.1, "1": 0.2 } }],
      }),
    ).toThrow(/不符合契約/);

    // minimum: 1 on dimensions.
    expect(() =>
      expectResponseMatchesContract(contract, "/embeddings", "post", 200, {
        model: "x",
        dimensions: 0,
        data: [],
      }),
    ).toThrow(/不符合契約/);

    // minItems: 1 on data[].embedding.
    expect(() =>
      expectResponseMatchesContract(contract, "/embeddings", "post", 200, {
        model: "x",
        dimensions: 2,
        data: [{ index: 0, embedding: [] }],
      }),
    ).toThrow(/不符合契約/);
  });
});

describe("expectResponseMatchesContract — generation.yaml (relocated rag-skeleton AC-C6)", () => {
  it("AC-C6 (PF0) schema 驗證抓不到捏造的引用 —— 那是 assertCitationsGrounded 的工作", async () => {
    const contract = await loadContract("generation");

    // Every field on Citation is a plain string/number — a citation naming a
    // chunk that was never in context is structurally valid.
    const fabricatedBody = {
      answer: "看起來正常的回答",
      citations: [
        { chunkId: "fabricated#0", documentId: "does-not-exist", startOffset: 0, endOffset: 5 },
      ],
    };

    expect(() =>
      expectResponseMatchesContract(contract, "/generate", "post", 200, fabricatedBody),
    ).not.toThrow();
  });
});
