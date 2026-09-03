/**
 * `HttpEmbeddingProvider` — calls a real `llama-server` (llama.cpp) running
 * bge-m3, over the endpoint E04-S087 measured (not guessed): `POST
 * {serverUrl}/v1/embeddings`, `{input: string[], model: string}` →
 * `{data: [{embedding: number[], index: number, object}], model, object,
 * usage}`. See `models/embedding/README.md`'s "E04-S087" section for the
 * real curl/response pairs this is built against, and ADR 0009 D2 for why
 * bge-m3 was chosen (symmetric encoder, no instruction-prefix failure mode).
 *
 * Shape modelled on `../asr/provider.ts`'s `WhisperServerProvider`: a named
 * provider, a declared model, one method, typed failures. Same reasoning:
 * this class depends on nothing it did not measure.
 *
 * ── WHY `/v1/embeddings`, NOT THE NATIVE `/embedding` ──────────────────────
 *
 * Both exist on `llama-server`. The native endpoint wraps each vector in an
 * extra array layer (`data[i].embedding[0]` is the real vector — a pooling
 * artefact); `/v1/embeddings` returns `data[i].embedding` as a flat
 * 1024-length array and additionally reports `usage.total_tokens`, useful
 * later for detecting oversized chunks. E04-S087 confirmed the two endpoints
 * produce bit-identical numbers, so this is a packaging choice, not an
 * accuracy one.
 *
 * ── THE ORDER CONTRACT (`EmbedResult.vectors` is IN INPUT ORDER) ───────────
 *
 * `data[i]` in the response carries its own `index` field, and E04-S087's
 * own README explicitly warns not to assume `data[i]` lines up with input
 * position `i` — E04-S087's rerank sibling measurement (`models/rerank/
 * README.md`) hit exactly this trap for real: the reranker's `results` come
 * back SORTED by score, with `index` naming the original input slot, and a
 * position-based zip would have handed every document somebody else's
 * score. `/v1/embeddings` is not documented to reorder, but nothing requires
 * it not to (the OpenAI embeddings API spec itself only promises `index`
 * matches input order — good practice does not excuse skipping the check),
 * so this provider always places each vector at `data[i].index`, never at
 * its position in the response array. `http.provider.test.ts` proves this
 * with a response that is deliberately shuffled.
 *
 * ── DEFENSIVE L2-NORMALISATION ──────────────────────────────────────────
 *
 * `services/retrieval`'s own `Embedding` contract (`services/retrieval/src/
 * embedding/provider.ts`) states normalisation is part of the deal so
 * callers can use a plain dot product for cosine similarity. E04-S087 did
 * not measure whether `llama-server`'s bge-m3 output is already unit-length
 * (the two spot-checked responses were not re-derived to a magnitude), so
 * this provider normalises every vector itself before returning it — an
 * upstream vector that already has magnitude 1 is unaffected (dividing by 1
 * is a no-op up to floating-point noise); one that is not gets corrected
 * rather than silently producing wrong cosine scores downstream. This is
 * the one piece of arithmetic in this file, and `http.provider.test.ts`
 * pins it against known vectors, not just "some transform happened".
 *
 * ── FAILURE TAXONOMY ────────────────────────────────────────────────────
 *
 * Every failure mode below (connection refused, timeout, non-2xx, unparsable
 * JSON, missing/malformed `data`, wrong vector length, non-finite numbers,
 * duplicate/out-of-range `index`, fewer vectors than inputs) throws the SAME
 * `EmbeddingUnavailableError` — deliberately, mirroring `../embedding/
 * provider.ts`'s own documented choice to fold timeouts into that one class
 * because `contracts/openapi/embedding.yaml` defines no distinct code for
 * any of these yet (adding one is a contract change, out of this story's
 * scope — 鐵律 #1). Messages differ so a human/log reader can tell them
 * apart; the thrown TYPE does not, on purpose.
 */
import type { EmbedInput, EmbedResult, EmbeddingProvider, EmbeddingProviderName } from "./provider.js";
import { EmbeddingUnavailableError } from "./provider.js";
import type { ProviderFidelity } from "../fidelity.js";

/** Measured by E04-S087 against the real `bge-m3-Q8_0.gguf` server, both endpoints, batch and single input. Not a guess. */
export const BGE_M3_DIMENSIONS = 1024;

const DEFAULT_MODEL = "bge-m3";

export interface HttpEmbeddingProviderOptions {
  readonly serverUrl: string;
  /** Sent as the `model` field of the request body and reported back as `EmbedResult.model`. Defaults to `"bge-m3"`, matching `models/embedding/README.md`'s curl examples. */
  readonly model?: string;
  /** Overridden by tests to avoid a real network call. */
  readonly fetchImpl?: typeof fetch;
}

interface RawEmbeddingsResponse {
  readonly data?: unknown;
}

interface RawEmbeddingsDataItem {
  readonly index?: unknown;
  readonly embedding?: unknown;
}

/** L2-normalise. A zero vector (magnitude 0) is returned unchanged — there is no direction to normalise it to, and forcing it to NaN would turn "the model returned nothing meaningful for this text" into a crash instead of a degenerate-but-finite score. */
function l2Normalise(vector: readonly number[]): number[] {
  let magnitude = 0;
  for (const value of vector) magnitude += value * value;
  magnitude = Math.sqrt(magnitude);
  if (magnitude === 0) return vector.slice();
  return vector.map((value) => value / magnitude);
}

/**
 * Real adapter: `POST {serverUrl}/v1/embeddings`, JSON body
 * `{input: string[], model: string}`, per `models/embedding/README.md`'s
 * "E04-S087" measurements. See this file's header for the full reasoning.
 */
export class HttpEmbeddingProvider implements EmbeddingProvider {
  readonly name: EmbeddingProviderName = "llama-server";
  readonly model: string;
  readonly dimensions = BGE_M3_DIMENSIONS;
  readonly fidelityCeiling: ProviderFidelity = "PF2";
  private readonly serverUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpEmbeddingProviderOptions) {
    this.serverUrl = options.serverUrl;
    this.model = options.model ?? DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async embed(input: EmbedInput): Promise<EmbedResult> {
    if (input.texts.length === 0) {
      return { vectors: [], model: this.model, dimensions: this.dimensions };
    }

    const requestModel = input.model ?? this.model;
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.serverUrl}/v1/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.texts, model: requestModel }),
        signal: AbortSignal.timeout(input.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new EmbeddingUnavailableError(
          `embedding 服務逾時(${input.timeoutMs}ms 內未回應,${this.serverUrl}/v1/embeddings)。`,
        );
      }
      throw new EmbeddingUnavailableError(`embedding 服務目前無法連線:${this.serverUrl}/v1/embeddings。`);
    }

    if (!response.ok) {
      throw new EmbeddingUnavailableError(
        `embedding 服務回傳非成功狀態:HTTP ${response.status}(${this.serverUrl}/v1/embeddings)。`,
      );
    }

    let body: RawEmbeddingsResponse;
    try {
      body = (await response.json()) as RawEmbeddingsResponse;
    } catch {
      throw new EmbeddingUnavailableError("embedding 服務回應不是合法的 JSON。");
    }

    const data = body?.data;
    if (!Array.isArray(data)) {
      throw new EmbeddingUnavailableError("embedding 服務回應缺少 data 陣列,形狀不符 /v1/embeddings 的預期。");
    }
    if (data.length !== input.texts.length) {
      throw new EmbeddingUnavailableError(
        `embedding 服務回傳 ${data.length} 筆向量,與輸入的 ${input.texts.length} 筆不符,拒絕使用。`,
      );
    }

    // IN-INPUT-ORDER RECONSTRUCTION — see this file's header. `entry.index`
    // decides placement; NEVER the position `entry` happens to occupy in
    // `data`. `http.provider.test.ts` feeds a deliberately shuffled `data`
    // array to prove this line, not the more convenient `data[i]`, is load-
    // bearing.
    const vectors: number[][] = new Array(input.texts.length);
    const placed = new Set<number>();
    for (const entry of data as readonly RawEmbeddingsDataItem[]) {
      const index = entry?.index;
      const embedding = entry?.embedding;
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= input.texts.length) {
        throw new EmbeddingUnavailableError(
          `embedding 服務回應的 index 欄位缺失或超出範圍(收到 ${JSON.stringify(index)},預期 0..${input.texts.length - 1})。`,
        );
      }
      if (placed.has(index)) {
        throw new EmbeddingUnavailableError(`embedding 服務回應對同一個 index(${index})回傳了不只一筆向量。`);
      }
      if (
        !Array.isArray(embedding) ||
        embedding.length !== this.dimensions ||
        !embedding.every((value) => typeof value === "number" && Number.isFinite(value))
      ) {
        throw new EmbeddingUnavailableError(
          `embedding 服務回傳第 ${index} 筆向量形狀不符預期(應為 ${this.dimensions} 維、皆為有限數值)。`,
        );
      }
      vectors[index] = l2Normalise(embedding as number[]);
      placed.add(index);
    }

    return { vectors, model: this.model, dimensions: this.dimensions };
  }
}
