/**
 * `HttpCrossEncoderProvider` (E04-S089) — unit tests against a FAKE `fetch`,
 * never a real `llama-server`. Real-server evidence is separate L3 manual
 * evidence (see PROGRESS.md's E04-S089 row) — these tests only prove this
 * class's OWN logic: request shaping, the index-based realignment
 * (`models/rerank/README.md`'s measured trap), the token-budget truncation
 * arithmetic, and honest error mapping.
 *
 * The response shapes below are copied VERBATIM from `models/rerank/
 * README.md`'s real, measured curls (E04-S087) wherever the test's point is
 * "does this class handle what the real server actually sends" — not
 * invented shapes.
 */
import { describe, expect, it, vi } from "vitest";
import {
  HttpCrossEncoderProvider,
  CrossEncoderUnavailableError,
  CrossEncoderTimeoutError,
  type CrossEncoderTruncationInfo,
} from "./cross-encoder-http.provider.js";
import { CrossEncoderError, sigmoid } from "./cross-encoder.js";

interface RecordedCall {
  readonly path: string;
  readonly body: unknown;
}

/**
 * Builds a `fetch`-shaped fake that dispatches on the request path, records
 * every call, and lets each test control /tokenize, /detokenize and /rerank
 * independently. `tokenizeFn` receives `{content, add_special}` and must
 * return a token array; the default is a simple deterministic "1 token per
 * character" stub — fine for tests that don't care about exact counts, and
 * overridden by tests that do (the truncation tests).
 */
function fakeFetch(options: {
  tokenizeFn?: (content: string, addSpecial: boolean) => readonly number[];
  detokenizeFn?: (tokens: readonly number[]) => string;
  rerankResponse?: unknown;
  rerankStatus?: number;
}): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const tokenizeFn =
    options.tokenizeFn ?? ((content: string) => Array.from(content).map((_, i) => i + 1));
  const detokenizeFn = options.detokenizeFn ?? ((tokens: readonly number[]) => `detok(${tokens.join(",")})`);

  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path: url.pathname, body });

    if (url.pathname === "/tokenize") {
      const tokens = tokenizeFn(body.content, body.add_special);
      return new Response(JSON.stringify({ tokens }), { status: 200 });
    }
    if (url.pathname === "/detokenize") {
      const content = detokenizeFn(body.tokens);
      return new Response(JSON.stringify({ content }), { status: 200 });
    }
    if (url.pathname === "/rerank") {
      return new Response(JSON.stringify(options.rerankResponse ?? { results: [] }), {
        status: options.rerankStatus ?? 200,
      });
    }
    throw new Error(`unexpected path in test fake: ${url.pathname}`);
  }) as typeof fetch;

  return { fetchImpl, calls };
}

const SERVER_URL = "http://127.0.0.1:8182";

describe("HttpCrossEncoderProvider — index-based realignment (the README-measured trap)", () => {
  it("realigns SCORE-SORTED results back to the caller's own passage order using `index`, NOT array position", async () => {
    // Exactly the deliberately-adversarial shape the story brief calls out:
    // the ONLY relevant passage is passages[2], but the server returns it
    // FIRST (because results are sorted by score, descending) and reuses
    // real measured numbers from models/rerank/README.md's own curl output.
    const passages = ["報稅提醒", "季報營收", "更換濾網的步驟"]; // index 2 is the only relevant one
    const { fetchImpl } = fakeFetch({
      rerankResponse: {
        model: "bge-reranker-v2-m3",
        object: "list",
        usage: { prompt_tokens: 1, total_tokens: 1 },
        results: [
          { index: 2, relevance_score: 6.4607 },
          { index: 1, relevance_score: -11.0008 },
          { index: 0, relevance_score: -11.0057 },
        ],
      },
    });

    const provider = new HttpCrossEncoderProvider({ serverUrl: SERVER_URL, fetchImpl });
    const scores = await provider.score("如何更換濾網", passages);

    expect(scores).toHaveLength(3);
    // The critical assertion: scores[2] (aligned to passages[2], the
    // relevant one) must carry the HIGH score — not scores[0], which is
    // where a naive positional zip of the SORTED `results` array would have
    // put it.
    expect(scores[2]!.rawScore).toBe(6.4607);
    expect(scores[0]!.rawScore).toBe(-11.0057);
    expect(scores[1]!.rawScore).toBe(-11.0008);
    // A positional-zip bug would make scores[0] the highest score instead —
    // assert the failure shape explicitly so a regression's message is
    // legible, not just "expected 6.4607, got -11.0057".
    expect(scores[0]!.rawScore).not.toBe(6.4607);
  });

  it("also handles the real 4-document /rerank response captured verbatim in models/rerank/README.md §②", async () => {
    const passages = [
      "更換濾網的步驟:先關閉電源,打開濾網艙蓋,取出舊濾網,裝上新濾網,再蓋回艙蓋。",
      "報稅時記得檢查扣除額項目,並在期限前完成申報以避免罰款。",
      "How to file your taxes: gather your W-2 forms, choose a filing status, and submit before the deadline.",
      "Replace the air filter every 3 months by opening the filter compartment and swapping the cartridge.",
    ];
    const { fetchImpl } = fakeFetch({
      rerankResponse: {
        model: "/data/python/AI_KM/models/rerank/BGE-Reranker-v2-M3-Q8_0.gguf",
        object: "list",
        usage: { prompt_tokens: 140, total_tokens: 140 },
        results: [
          { index: 0, relevance_score: 6.482923984527588 },
          { index: 3, relevance_score: -0.01437273621559143 },
          { index: 1, relevance_score: -11.016740798950195 },
          { index: 2, relevance_score: -11.01986312866211 },
        ],
      },
    });

    const provider = new HttpCrossEncoderProvider({ serverUrl: SERVER_URL, fetchImpl });
    const scores = await provider.score("如何更換濾網", passages);

    expect(scores.map((s) => s.rawScore)).toEqual([
      6.482923984527588,
      -11.016740798950195,
      -11.01986312866211,
      -0.01437273621559143,
    ]);
    expect(scores.map((s) => s.relevanceScore)).toEqual(scores.map((s) => sigmoid(s.rawScore)));
    expect(scores.every((s) => s.truncated === false)).toBe(true);
  });
});

describe("HttpCrossEncoderProvider — token-budget truncation (ADR 0009 R2, never silent)", () => {
  it("does NOT truncate a passage that fits comfortably within the budget", async () => {
    const { fetchImpl, calls } = fakeFetch({
      tokenizeFn: (content, addSpecial) => {
        if (content === "問題") return addSpecial ? [1, 2, 3] : [2]; // query: 3 tokens with special
        return addSpecial ? [1, 2, 3, 4, 5] : [2, 3, 4]; // passage content: 3 tokens
      },
      rerankResponse: { results: [{ index: 0, relevance_score: 1 }] },
    });

    const onTruncated = vi.fn();
    const provider = new HttpCrossEncoderProvider({
      serverUrl: SERVER_URL,
      fetchImpl,
      maxTokens: 20,
      onTruncated,
    });
    const scores = await provider.score("問題", ["短文件"]);

    expect(scores[0]!.truncated).toBe(false);
    expect(onTruncated).not.toHaveBeenCalled();
    const rerankCall = calls.find((c) => c.path === "/rerank")!;
    expect((rerankCall.body as { documents: string[] }).documents).toEqual(["短文件"]);
    // No /detokenize round trip should happen when nothing needs truncating.
    expect(calls.some((c) => c.path === "/detokenize")).toBe(false);
  });

  it("truncates a passage that does NOT fit, using the server's OWN tokenizer (not a guessed ratio), and reports it via onTruncated", async () => {
    // maxTokens=10, query costs 4 tokens with special -> content budget =
    // 10 - 4 - 2(PASSAGE_BOS_EOS_TOKENS) = 4 content tokens.
    const fullContentTokens = [10, 11, 12, 13, 14, 15, 16]; // 7 tokens — over budget
    const { fetchImpl, calls } = fakeFetch({
      tokenizeFn: (content, addSpecial) => {
        if (content === "問題") return addSpecial ? [1, 2, 3, 4] : [3, 4];
        return addSpecial ? [0, ...fullContentTokens, 99] : fullContentTokens;
      },
      detokenizeFn: (tokens) => `TRUNCATED[${tokens.join(",")}]`,
      rerankResponse: { results: [{ index: 0, relevance_score: -2 }] },
    });

    const onTruncated = vi.fn();
    const provider = new HttpCrossEncoderProvider({
      serverUrl: SERVER_URL,
      fetchImpl,
      maxTokens: 10,
      onTruncated,
    });
    const scores = await provider.score("問題", ["很長很長的段落內容"]);

    expect(scores[0]!.truncated).toBe(true);
    expect(onTruncated).toHaveBeenCalledTimes(1);
    const info: CrossEncoderTruncationInfo = onTruncated.mock.calls[0]![0];
    expect(info).toEqual({ index: 0, originalTokens: 7, truncatedTokens: 4 });

    const detokenizeCall = calls.find((c) => c.path === "/detokenize")!;
    expect((detokenizeCall.body as { tokens: number[] }).tokens).toEqual([10, 11, 12, 13]); // first 4 of the 7

    const rerankCall = calls.find((c) => c.path === "/rerank")!;
    expect((rerankCall.body as { documents: string[] }).documents).toEqual(["TRUNCATED[10,11,12,13]"]);
  });

  it("rejects outright when the query alone leaves no budget for any passage, rather than sending a request guaranteed to fail or mis-truncate", async () => {
    const { fetchImpl, calls } = fakeFetch({
      tokenizeFn: () => new Array(600).fill(1), // way over maxTokens on its own
    });
    const provider = new HttpCrossEncoderProvider({ serverUrl: SERVER_URL, fetchImpl, maxTokens: 512 });

    await expect(provider.score("一個異常長的查詢", ["任何段落"])).rejects.toThrow(CrossEncoderError);
    // Must fail BEFORE ever calling /rerank — no wasted or malformed request.
    expect(calls.some((c) => c.path === "/rerank")).toBe(false);
  });
});

describe("HttpCrossEncoderProvider — malformed server responses are rejected, never silently misapplied", () => {
  it("throws when the result count does not match the passage count", async () => {
    const { fetchImpl } = fakeFetch({
      rerankResponse: { results: [{ index: 0, relevance_score: 1 }] }, // only 1, but 2 passages sent
    });
    const provider = new HttpCrossEncoderProvider({ serverUrl: SERVER_URL, fetchImpl });

    await expect(provider.score("q", ["a", "b"])).rejects.toThrow(CrossEncoderError);
    await expect(provider.score("q", ["a", "b"])).rejects.toThrow(/數量不符/);
  });

  it("throws when the same index is returned more than once", async () => {
    const { fetchImpl } = fakeFetch({
      rerankResponse: {
        results: [
          { index: 0, relevance_score: 1 },
          { index: 0, relevance_score: 2 },
        ],
      },
    });
    const provider = new HttpCrossEncoderProvider({ serverUrl: SERVER_URL, fetchImpl });

    await expect(provider.score("q", ["a", "b"])).rejects.toThrow(/不只一筆/);
  });

  it("throws when an index is out of range", async () => {
    const { fetchImpl } = fakeFetch({
      rerankResponse: {
        results: [
          { index: 0, relevance_score: 1 },
          { index: 5, relevance_score: 2 },
        ],
      },
    });
    const provider = new HttpCrossEncoderProvider({ serverUrl: SERVER_URL, fetchImpl });

    await expect(provider.score("q", ["a", "b"])).rejects.toThrow(/超出/);
  });

  it("throws when an index is missing from the results (count matches but coverage doesn't)", async () => {
    const { fetchImpl } = fakeFetch({
      rerankResponse: {
        results: [
          { index: 0, relevance_score: 1 },
          { index: 0, relevance_score: 2 }, // duplicate 0, missing 1 — count is 2, coverage isn't
        ],
      },
    });
    const provider = new HttpCrossEncoderProvider({ serverUrl: SERVER_URL, fetchImpl });
    // This particular shape trips the duplicate-index guard first; covered
    // for completeness of "count matched, coverage didn't" as a concept.
    await expect(provider.score("q", ["a", "b"])).rejects.toThrow(CrossEncoderError);
  });

  it("throws when relevance_score is not a finite number", async () => {
    const { fetchImpl } = fakeFetch({
      rerankResponse: { results: [{ index: 0, relevance_score: Number.NaN }] },
    });
    const provider = new HttpCrossEncoderProvider({ serverUrl: SERVER_URL, fetchImpl });

    await expect(provider.score("q", ["a"])).rejects.toThrow(CrossEncoderError);
  });
});

describe("HttpCrossEncoderProvider — transport errors are mapped honestly, not swallowed", () => {
  it("maps a network failure to CrossEncoderUnavailableError", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const provider = new HttpCrossEncoderProvider({ serverUrl: SERVER_URL, fetchImpl });

    await expect(provider.score("q", ["a"])).rejects.toThrow(CrossEncoderUnavailableError);
  });

  it("maps an abort/timeout to CrossEncoderTimeoutError", async () => {
    const fetchImpl = (async () => {
      const err = new Error("The operation was aborted");
      err.name = "TimeoutError";
      throw err;
    }) as unknown as typeof fetch;
    const provider = new HttpCrossEncoderProvider({ serverUrl: SERVER_URL, fetchImpl, timeoutMs: 5 });

    await expect(provider.score("q", ["a"])).rejects.toThrow(CrossEncoderTimeoutError);
  });

  it("maps a non-2xx response to CrossEncoderUnavailableError", async () => {
    const { fetchImpl } = fakeFetch({ rerankResponse: { error: "boom" }, rerankStatus: 500 });
    const provider = new HttpCrossEncoderProvider({ serverUrl: SERVER_URL, fetchImpl });

    await expect(provider.score("q", ["a"])).rejects.toThrow(CrossEncoderUnavailableError);
  });

  it("maps a non-JSON body to CrossEncoderError", async () => {
    const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input));
      if (url.pathname === "/tokenize") return new Response(JSON.stringify({ tokens: [1] }), { status: 200 });
      return new Response("not json", { status: 200 });
    }) as typeof fetch;
    const provider = new HttpCrossEncoderProvider({ serverUrl: SERVER_URL, fetchImpl });

    await expect(provider.score("q", ["a"])).rejects.toThrow(CrossEncoderError);
  });
});

describe("HttpCrossEncoderProvider — trivial input handling", () => {
  it("returns [] for an empty passages array WITHOUT making any HTTP call at all", async () => {
    const { fetchImpl, calls } = fakeFetch({});
    const provider = new HttpCrossEncoderProvider({ serverUrl: SERVER_URL, fetchImpl });

    const scores = await provider.score("問題", []);

    expect(scores).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("rejects an empty query without calling the server", async () => {
    const { fetchImpl, calls } = fakeFetch({});
    const provider = new HttpCrossEncoderProvider({ serverUrl: SERVER_URL, fetchImpl });

    await expect(provider.score("   ", ["a"])).rejects.toThrow(CrossEncoderError);
    expect(calls).toHaveLength(0);
  });
});
