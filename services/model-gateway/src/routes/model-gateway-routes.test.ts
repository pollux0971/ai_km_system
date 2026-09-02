/**
 * `POST /v1/embeddings` / `POST /v1/generate` (policy L2 seam/contract, PF1).
 *
 * The load-bearing assertions are AC-R1 and AC-R6: the route returns exactly
 * what the in-process call returns. That is the whole claim of the 2026-09-02
 * decision — the HTTP surface is a wrapper, not a second implementation — and
 * it has to be a measurement, not a comment, or the two paths will drift
 * exactly the way E04-S049…S053's seams did.
 *
 * PF is PF1 throughout: generation is still the placeholder fake; embedding is
 * the real (ceiling PF1) deterministic hasher (E12-S032). Nothing here is
 * evidence about vectors or answers.
 */
import { describe, expect, it } from "vitest";
import { buildGatewayTestApp, TEST_USER_HEADER } from "../testing/build-gateway-test-app.js";
import { expectResponseMatchesContract, loadContract } from "../testing/contract-check.js";
import { createModelGateway, type ModelGateway } from "../gateway.js";
import { EmbeddingUnavailableError } from "../embedding/provider.js";
import { createDeterministicEmbeddingProvider } from "../embedding/deterministic.provider.js";
import { FakeGenerationProvider, type GenerationProvider } from "../generation/provider.js";

const USER = { [TEST_USER_HEADER]: "u-test" };
const CONTEXT = [
  { chunkId: "doc-1#0", documentId: "doc-1", text: "泵浦於 8/12 更換軸封。", startOffset: 0, endOffset: 12 },
];

function realGateway(overrides: Partial<Parameters<typeof createModelGateway>[0]> = {}): ModelGateway {
  return createModelGateway({
    embedding: createDeterministicEmbeddingProvider({ dimensions: 16 }),
    generation: new FakeGenerationProvider(),
    ...overrides,
  });
}

describe("POST /v1/embeddings", () => {
  it("AC-R1 ★ route 回傳與 in-process 呼叫完全相同——證明它是薄包裝而非第二套實作", async () => {
    const gateway = realGateway();
    const { app } = await buildGatewayTestApp(gateway);

    const inProcess = await gateway.embed({ input: ["軸承過熱", "maintenance log"] }, "cid");
    const overHttp = await app.inject({
      method: "POST",
      url: "/v1/embeddings",
      headers: USER,
      payload: { input: ["軸承過熱", "maintenance log"] },
    });

    expect(overHttp.statusCode).toBe(200);
    expect(overHttp.json()).toEqual(JSON.parse(JSON.stringify(inProcess)));
    await app.close();
  });

  it("AC-R2 (L2) 200 回應符合 embedding.yaml", async () => {
    const contract = await loadContract("embedding");
    const { app } = await buildGatewayTestApp(realGateway());
    const res = await app.inject({
      method: "POST", url: "/v1/embeddings", headers: USER, payload: { input: ["甲"] },
    });
    expect(res.statusCode).toBe(200);
    expectResponseMatchesContract(contract, "/embeddings", "post", 200, res.json());
    await app.close();
  });

  it("AC-R3 (L2) 空輸入 → 400 VALIDATION_ERROR,且符合契約", async () => {
    const contract = await loadContract("embedding");
    const { app } = await buildGatewayTestApp(realGateway());
    const res = await app.inject({
      method: "POST", url: "/v1/embeddings", headers: USER, payload: { input: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
    expectResponseMatchesContract(contract, "/embeddings", "post", 400, res.json());
    await app.close();
  });

  it("AC-R4 (L2) 超量批次 → 413 PAYLOAD_TOO_LARGE,且符合契約", async () => {
    const contract = await loadContract("embedding");
    const { app } = await buildGatewayTestApp(realGateway());
    const res = await app.inject({
      method: "POST", url: "/v1/embeddings", headers: USER,
      payload: { input: Array.from({ length: 257 }, (_, i) => `t${i}`) },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe("PAYLOAD_TOO_LARGE");
    expectResponseMatchesContract(contract, "/embeddings", "post", 413, res.json());
    await app.close();
  });

  it("AC-R5 (L2) provider 掛掉 → 503 EMBEDDING_UNAVAILABLE,不是空結果", async () => {
    const contract = await loadContract("embedding");
    const down = {
      name: "fake" as const, model: "down", dimensions: 4, fidelityCeiling: "PF1" as const,
      async embed(): Promise<never> {
        throw new EmbeddingUnavailableError("嵌入模型目前無法使用。");
      },
    };
    const { app } = await buildGatewayTestApp(realGateway({ embedding: down }));
    const res = await app.inject({
      method: "POST", url: "/v1/embeddings", headers: USER, payload: { input: ["甲"] },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("EMBEDDING_UNAVAILABLE");
    // A 200 with an empty vector would look like "no matching documents".
    expect(res.json()).not.toHaveProperty("data");
    expectResponseMatchesContract(contract, "/embeddings", "post", 503, res.json());
    await app.close();
  });

  it("AC-R6 未登入 → 401,授權在任何模型呼叫之前", async () => {
    const { app } = await buildGatewayTestApp(realGateway());
    const res = await app.inject({ method: "POST", url: "/v1/embeddings", payload: { input: ["甲"] } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("AC-R7 telemetry 只記 metadata,不記輸入文字也不記向量", async () => {
    const { app, telemetryLog } = await buildGatewayTestApp(realGateway());
    await app.inject({
      method: "POST", url: "/v1/embeddings", headers: USER, payload: { input: ["機密的維修內容"] },
    });
    expect(telemetryLog).toHaveLength(1);
    const entry = telemetryLog[0]!;

    // Assert the field SET, not a substring of the serialised log: the message
    // is "embeddings completed", so a `not.toContain("embedding")` check passes
    // or fails for the wrong reason. What matters is that no field carries the
    // input text or a vector.
    expect(Object.keys(entry.fields).sort()).toEqual([
      "correlationId",
      "count",
      "dimensions",
      "model",
      "processingMs",
    ]);
    for (const value of Object.values(entry.fields)) {
      expect(Array.isArray(value)).toBe(false);
      expect(typeof value === "string" || typeof value === "number").toBe(true);
    }
    expect(JSON.stringify(entry.fields)).not.toContain("機密的維修內容");
    await app.close();
  });
});

describe("POST /v1/generate", () => {
  it("AC-R8 ★ route 回傳與 in-process 呼叫完全相同", async () => {
    const gateway = realGateway();
    const { app } = await buildGatewayTestApp(gateway);
    const inProcess = await gateway.generate({ question: "問題", context: CONTEXT }, "cid");
    const overHttp = await app.inject({
      method: "POST", url: "/v1/generate", headers: USER,
      payload: { question: "問題", context: CONTEXT },
    });
    expect(overHttp.statusCode).toBe(200);
    expect(overHttp.json()).toEqual(JSON.parse(JSON.stringify(inProcess)));
    await app.close();
  });

  it("AC-R9 (L2) 200 回應符合 generation.yaml", async () => {
    const contract = await loadContract("generation");
    const { app } = await buildGatewayTestApp(realGateway());
    const res = await app.inject({
      method: "POST", url: "/v1/generate", headers: USER,
      payload: { question: "問題", context: CONTEXT },
    });
    expect(res.statusCode).toBe(200);
    expectResponseMatchesContract(contract, "/generate", "post", 200, res.json());
    await app.close();
  });

  it("AC-R10 (L2) 空 context → 422 GENERATION_NO_CONTEXT,且符合契約", async () => {
    const contract = await loadContract("generation");
    const { app } = await buildGatewayTestApp(realGateway());
    const res = await app.inject({
      method: "POST", url: "/v1/generate", headers: USER,
      payload: { question: "問題", context: [] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("GENERATION_NO_CONTEXT");
    expectResponseMatchesContract(contract, "/generate", "post", 422, res.json());
    await app.close();
  });

  it("AC-R11 (L2) ★ provider 捏造引用 → 503,整個回應被拒,不會半套服務出去", async () => {
    const contract = await loadContract("generation");
    const rogue: GenerationProvider = {
      name: "fake", model: "rogue", fidelityCeiling: "PF1",
      async generate() {
        return {
          answer: "含捏造來源的回答",
          citations: [{ chunkId: "fabricated#0", documentId: "nope", startOffset: 0, endOffset: 1 }],
          model: "rogue",
        };
      },
    };
    const { app } = await buildGatewayTestApp(realGateway({ generation: rogue }));
    const res = await app.inject({
      method: "POST", url: "/v1/generate", headers: USER,
      payload: { question: "問題", context: CONTEXT },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("GENERATION_UNAVAILABLE");
    // The fabricated answer must not reach the caller in any form.
    expect(res.body).not.toContain("fabricated");
    expect(res.body).not.toContain("含捏造來源的回答");
    expectResponseMatchesContract(contract, "/generate", "post", 503, res.json());
    await app.close();
  });

  it("AC-R12 未登入 → 401", async () => {
    const { app } = await buildGatewayTestApp(realGateway());
    const res = await app.inject({
      method: "POST", url: "/v1/generate", payload: { question: "問題", context: CONTEXT },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
