/**
 * `HttpEmbeddingProvider` — unit tests. All network calls go through a fake
 * `fetchImpl`; nothing here depends on a real `llama-server` being up (see
 * `http.provider.ts`'s header, and the story's L3 evidence for the real
 * server run).
 *
 * Two of the tests below are marked ★ — they are the reverse-verification
 * targets `tools/mutate.mjs` was run against (see commit body for the red/
 * green evidence blocks). Both assert on a VALUE that a broken
 * implementation would change (a dot-product result picking out one
 * dimension; a specific normalised coordinate) — never on mere existence
 * ("got a result", "length > 0") per `.claude/rules/GHERKIN_WORKFLOW.md`
 * §5.2 / `E06-S042`'s lesson.
 */
import { describe, expect, it, vi } from "vitest";
import { BGE_M3_DIMENSIONS, HttpEmbeddingProvider } from "./http.provider.js";
import { EmbeddingUnavailableError, type EmbedInput } from "./provider.js";
import { createDeterministicEmbeddingProvider } from "./deterministic.provider.js";

const SERVER_URL = "http://127.0.0.1:8181";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function vectorWith(nonZero: Record<number, number>, dims = BGE_M3_DIMENSIONS): number[] {
  const v = new Array(dims).fill(0);
  for (const [i, value] of Object.entries(nonZero)) v[Number(i)] = value;
  return v;
}

function baseInput(texts: string[]): EmbedInput {
  return { texts, timeoutMs: 5000, correlationId: "cid-1" };
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, value, i) => sum + value * b[i]!, 0);
}

describe("HttpEmbeddingProvider — identity", () => {
  it("declares name/model/dimensions/fidelityCeiling", () => {
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL });
    expect(provider.name).toBe("llama-server");
    expect(provider.model).toBe("bge-m3");
    expect(provider.dimensions).toBe(1024);
    expect(provider.fidelityCeiling).toBe("PF2");
  });

  it("accepts a custom model pin via the constructor", () => {
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, model: "bge-m3-Q8_0.gguf" });
    expect(provider.model).toBe("bge-m3-Q8_0.gguf");
  });

  it("★ reverse-verification target (c), precondition: identity differs from the deterministic placeholder it replaces", () => {
    const http = new HttpEmbeddingProvider({ serverUrl: SERVER_URL });
    const deterministic = createDeterministicEmbeddingProvider();
    expect(http.dimensions).toBe(1024);
    expect(http.dimensions).not.toBe(deterministic.dimensions);
    expect(http.model).not.toBe(deterministic.model);
  });
});

describe("HttpEmbeddingProvider — request shape", () => {
  it("empty input short-circuits without a network call", async () => {
    const fetchImpl = vi.fn();
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await provider.embed(baseInput([]));
    expect(result.vectors).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POSTs {input, model} JSON to {serverUrl}/v1/embeddings", async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`${SERVER_URL}/v1/embeddings`);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(init!.body as string)).toEqual({ input: ["如何更換濾網"], model: "bge-m3" });
      return jsonResponse({ data: [{ index: 0, embedding: vectorWith({ 0: 1 }) }] });
    });
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    await provider.embed(baseInput(["如何更換濾網"]));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("input.model overrides the provider's default model in the request body", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(JSON.parse(init!.body as string).model).toBe("pinned-model");
      return jsonResponse({ data: [{ index: 0, embedding: vectorWith({ 0: 1 }) }] });
    });
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    await provider.embed({ ...baseInput(["x"]), model: "pinned-model" });
  });
});

describe("HttpEmbeddingProvider — order contract (EmbedResult.vectors is IN INPUT ORDER)", () => {
  it("★ reverse-verification target (a): places vectors by response `index`, not by response array position", async () => {
    // `data` is DELIBERATELY shuffled relative to input order: input 0/1/2
    // map to e0/e1/e2, but the response lists them 2, 0, 1.
    const e0 = vectorWith({ 0: 1 });
    const e1 = vectorWith({ 1: 1 });
    const e2 = vectorWith({ 2: 1 });
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          { index: 2, embedding: e2, object: "embedding" },
          { index: 0, embedding: e0, object: "embedding" },
          { index: 1, embedding: e1, object: "embedding" },
        ],
      }),
    );
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await provider.embed(baseInput(["文件A", "文件B", "文件C"]));

    // Decisive on CONTENT via a dot product that isolates one dimension: if
    // placement used response-array position instead of `index`, vectors[0]
    // would hold e2's data and this would read 0, not 1.
    expect(dot(result.vectors[0]!, e0)).toBeCloseTo(1);
    expect(dot(result.vectors[1]!, e1)).toBeCloseTo(1);
    expect(dot(result.vectors[2]!, e2)).toBeCloseTo(1);
    expect(dot(result.vectors[0]!, e2)).toBeCloseTo(0);
    expect(dot(result.vectors[2]!, e0)).toBeCloseTo(0);
  });
});

describe("HttpEmbeddingProvider — normalisation", () => {
  it("★ reverse-verification target (b): L2-normalises a non-unit vector (decisive on value, not existence)", async () => {
    // magnitude 5 ([3, 4, 0, ...]); unit form is [0.6, 0.8, 0, ...].
    const raw = vectorWith({ 0: 3, 1: 4 });
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ index: 0, embedding: raw }] }));
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await provider.embed(baseInput(["x"]));

    expect(result.vectors[0]![0]).toBeCloseTo(0.6);
    expect(result.vectors[0]![1]).toBeCloseTo(0.8);
    const magnitude = Math.sqrt(result.vectors[0]!.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1);
  });

  it("leaves an already-unit vector unchanged (idempotent, not just non-decreasing)", async () => {
    const unit = vectorWith({ 0: 1 });
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ index: 0, embedding: unit }] }));
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await provider.embed(baseInput(["x"]));
    expect(result.vectors[0]![0]).toBeCloseTo(1);
  });
});

describe("HttpEmbeddingProvider — typed failures (all EmbeddingUnavailableError)", () => {
  it("connection failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.embed(baseInput(["x"]))).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });

  it("timeout (fetchImpl throws a TimeoutError, mirroring AbortSignal.timeout's real behaviour)", async () => {
    const fetchImpl = vi.fn(async () => {
      const error = new Error("The operation was aborted");
      error.name = "TimeoutError";
      throw error;
    });
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.embed(baseInput(["x"]))).rejects.toMatchObject({
      name: "EmbeddingUnavailableError",
      message: expect.stringContaining("逾時"),
    });
  });

  it("non-2xx status", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 500));
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.embed(baseInput(["x"]))).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });

  it("unparsable JSON body", async () => {
    const fetchImpl = vi.fn(async () => new Response("not json", { status: 200 }));
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.embed(baseInput(["x"]))).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });

  it("missing `data` array", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ model: "bge-m3" }));
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.embed(baseInput(["x"]))).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });

  it("vector count does not match input count", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ index: 0, embedding: vectorWith({ 0: 1 }) }] }));
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.embed(baseInput(["x", "y"]))).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });

  it("out-of-range index", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ index: 5, embedding: vectorWith({ 0: 1 }) }] }));
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.embed(baseInput(["x"]))).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });

  it("duplicate index", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          { index: 0, embedding: vectorWith({ 0: 1 }) },
          { index: 0, embedding: vectorWith({ 1: 1 }) },
        ],
      }),
    );
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.embed(baseInput(["x", "y"]))).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });

  it("vector length does not match declared dimensions", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ index: 0, embedding: [1, 2, 3] }] }));
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.embed(baseInput(["x"]))).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });

  it("non-finite numbers in the vector", async () => {
    const bad = vectorWith({ 0: 1 });
    bad[10] = Number.NaN;
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ index: 0, embedding: bad }] }));
    const provider = new HttpEmbeddingProvider({ serverUrl: SERVER_URL, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.embed(baseInput(["x"]))).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });
});
