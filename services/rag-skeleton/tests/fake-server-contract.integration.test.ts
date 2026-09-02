/**
 * PF2 — the two fake servers are held to the frozen yaml at runtime.
 *
 * WHAT THIS PROVES (and what it does not)
 *
 * Real socket, real JSON serialisation, real error mapping, validated against
 * `contracts/openapi/{embedding,generation}.yaml` with ajv. That covers the
 * constraints the compile-time compat checks structurally cannot see:
 * `additionalProperties: false`, `minItems`, `maxItems`, `minimum`.
 *
 * It proves NOTHING about vector quality, semantic recall or answer quality.
 * Both servers are fakes; their evidence ceiling is PF2 and
 * `requireProviderFidelity` enforces that below rather than leaving it in a
 * comment.
 */
import { afterAll, describe, expect, it } from "vitest";

import { startFakeEmbeddingServer } from "../testing/fake-embedding-server.js";
import { startFakeGenerationServer } from "../testing/fake-generation-server.js";
import {
  expectRequestMatchesContract,
  expectResponseMatchesContract,
  fakeServerComponent,
  loadContract,
} from "../src/testing/contract-check.js";
import { requireProviderFidelity } from "@ai-km/service-retrieval";

const closers: Array<() => Promise<void>> = [];
afterAll(async () => {
  for (const close of closers) await close();
});

const embeddingServerComponent = fakeServerComponent("embedding:fake-http-server");
const generationServerComponent = fakeServerComponent("generation:fake-http-server");

async function postJson(url: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe("fake servers — runtime contract conformance", () => {
  it("AC-C1 (PF2) 這組測試宣稱的層級與實際元件相符", () => {
    // Claiming PF2 with PF2 components passes; claiming PF3 with them must not.
    expect(() =>
      requireProviderFidelity("PF2", [embeddingServerComponent, generationServerComponent]),
    ).not.toThrow();
    expect(() =>
      requireProviderFidelity("PF3", [embeddingServerComponent, generationServerComponent]),
    ).toThrow(/PF3/);
  });

  it("AC-C2 (PF2) 假 embedding server 的 200 回應符合 embedding.yaml", async () => {
    const contract = await loadContract("embedding");
    const server = await startFakeEmbeddingServer({ dimensions: 64 });
    closers.push(server.close);

    const request = { input: ["維修紀錄", "maintenance log"] };
    expectRequestMatchesContract(contract, "/embeddings", "post", request);

    const { status, body } = await postJson(`${server.url}/v1/embeddings`, request);
    expect(status).toBe(200);
    expectResponseMatchesContract(contract, "/embeddings", "post", 200, body);

    // The wire really did carry arrays, not a Float32Array serialised as an object.
    const data = (body as { data: Array<{ index: number; embedding: number[] }> }).data;
    expect(data).toHaveLength(2);
    expect(Array.isArray(data[0]?.embedding)).toBe(true);
    expect(data[0]?.embedding).toHaveLength(64);
  });

  it("AC-C3 (PF2) 假 embedding server 的錯誤回應符合 Error schema", async () => {
    const contract = await loadContract("embedding");
    const server = await startFakeEmbeddingServer({ forceStatus: 503 });
    closers.push(server.close);

    const { status, body } = await postJson(`${server.url}/v1/embeddings`, { input: ["x"] });
    expect(status).toBe(503);
    expectResponseMatchesContract(contract, "/embeddings", "post", 503, body);
  });

  it("AC-C4 (PF2) 假 generation server 的 200 回應符合 generation.yaml", async () => {
    const contract = await loadContract("generation");
    const server = await startFakeGenerationServer();
    closers.push(server.close);

    const request = {
      question: "上個月泵浦的維修紀錄?",
      context: [
        {
          chunkId: "doc-1#0",
          documentId: "doc-1",
          text: "泵浦於 8/12 更換軸封。",
          startOffset: 0,
          endOffset: 12,
          score: 0.9,
        },
      ],
    };
    expectRequestMatchesContract(contract, "/generate", "post", request);

    const { status, body } = await postJson(`${server.url}/v1/generate`, request);
    expect(status).toBe(200);
    expectResponseMatchesContract(contract, "/generate", "post", 200, body);
  });

  it("AC-C5 (PF2) 空 context 走 422,且回應符合 Error schema", async () => {
    const contract = await loadContract("generation");
    const server = await startFakeGenerationServer();
    closers.push(server.close);

    const { status, body } = await postJson(`${server.url}/v1/generate`, {
      question: "沒有來源的問題",
      context: [],
    });
    expect(status).toBe(422);
    expectResponseMatchesContract(contract, "/generate", "post", 422, body);
  });

  it("AC-C6 (PF2) schema 驗證抓不到捏造的引用 —— 那是 assertCitationsGrounded 的工作", async () => {
    const contract = await loadContract("generation");
    const server = await startFakeGenerationServer({ forceFabricatedCitation: true });
    closers.push(server.close);

    const { status, body } = await postJson(`${server.url}/v1/generate`, {
      question: "問題",
      context: [
        {
          chunkId: "doc-1#0",
          documentId: "doc-1",
          text: "內容",
          startOffset: 0,
          endOffset: 2,
        },
      ],
    });
    expect(status).toBe(200);

    // A fabricated citation is structurally valid — every field has the right
    // type. This is recorded as a test, not a comment, so nobody concludes
    // that schema validation makes the grounding check redundant.
    expect(() =>
      expectResponseMatchesContract(contract, "/generate", "post", 200, body),
    ).not.toThrow();
    const citations = (body as { citations: Array<{ chunkId: string }> }).citations;
    expect(citations.map((c) => c.chunkId)).toContain("fabricated#0");
  });

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

    // minItems: 1 on the request's input.
    expect(() => expectRequestMatchesContract(contract, "/embeddings", "post", { input: [] })).toThrow(
      /不符合契約/,
    );
  });
});
