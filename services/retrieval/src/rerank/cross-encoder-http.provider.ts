/**
 * `HttpCrossEncoderProvider` — real adapter to the llama.cpp `/rerank`
 * sidecar running `bge-reranker-v2-m3` (ADR 0009 D3, `models/rerank/
 * README.md`). Modelled deliberately on `../../../model-gateway/src/asr/
 * provider.ts`'s `WhisperServerProvider`: explicit `serverUrl`, an
 * injectable `fetchImpl` so unit tests never touch a real socket, and named
 * error classes instead of letting `fetch`'s own errors leak through.
 *
 * ── ENDPOINT SHAPE (measured, not guessed — E04-S087) ───────────────────────
 *
 * `models/rerank/README.md` ran real curls against a real `llama-server
 * --reranking` instance and recorded:
 *
 *   POST {serverUrl}/rerank  { query: string, documents: string[] }
 *     -> { model, object, usage, results: [{ index, relevance_score }] }
 *
 * `results` is SORTED BY SCORE, descending — `index` is the only field
 * tying a score back to `documents[index]`. See `cross-encoder.ts`'s header
 * for why `score()`'s CONTRACT forbids a caller from ever seeing that
 * unsorted-vs-sorted mismatch: this class does the index-based realignment
 * once, here, and is the thing `cross-encoder-http.provider.test.ts`
 * exercises with the exact reordered-results shape from the README to prove
 * it.
 *
 * ── THE TOKEN BUDGET (ADR 0009 R2 / `models/rerank/README.md`) ─────────────
 *
 * The model's context is 512 tokens for `query + passage` TOGETHER — this
 * class's own `n_ctx_seq` was observed as 512 at startup, and the running
 * server's `/rerank` was independently observed refusing (HTTP 500, "input
 * (N tokens) is too large to process") a request combining to 650 tokens
 * while accepting one combining to exactly 512. **This is not the silent
 * truncation `models/rerank/README.md` warned might happen — measured
 * against this actual llama.cpp build, going over the budget is a loud
 * error, not a quiet one.** But a loud error for ONE oversized passage still
 * fails the ENTIRE `/rerank` call (llama.cpp scores a whole batch of
 * documents in one request and rejects the batch if any single pair is too
 * long) — so left unhandled, one long chunk in a candidate pool would zero
 * out reranking for every OTHER candidate in that pool too, which is exactly
 * the kind of failure this story exists to prevent. This class therefore
 * pre-checks and truncates PROACTIVELY, using the server's own tokenizer
 * (never a guessed characters-per-token ratio), so the request this class
 * sends never trips that 500 in the first place.
 *
 * The exact token-accounting formula below was independently measured
 * (`/tokenize`, `/detokenize`, `/rerank` against the real server, 2026-09-04)
 * rather than read off llama.cpp's `format_prompt_rerank` source alone
 * (`STORY_WORKFLOW.md`'s "機制要用量的,不要用讀的"):
 *
 *   tokenize(query,  add_special=true).length   -- call this Q
 *   tokenize(passage, add_special=true).length  -- call this D
 *   Q + D === the ACTUAL combined token count `/rerank` uses for that pair.
 *
 * Verified twice with different query/document pairs (7+37=44, 9+22=31,
 * both matching `/rerank`'s own `usage.prompt_tokens` exactly for a
 * single-document request). Structurally this holds because llama.cpp's
 * fallback template is `[bos] query [eos] [sep] passage [eos]`
 * (`tools/server/server-common.cpp`'s `format_prompt_rerank`) and this
 * model's `sep` token costs exactly one token, the same as the `bos` that
 * `tokenize(passage, add_special=true)` counts but the combined prompt does
 * NOT actually spend on the passage — the two errors cancel exactly.
 *
 * That gives an exact budget for the passage's OWN content tokens (i.e.
 * `tokenize(passage, add_special=false)`, no bos/eos): if `content.length >
 * maxTokens - Q - 2`, the passage does not fit. `-2` is `tokenize(passage,
 * add_special=true).length - tokenize(passage, add_special=false).length`
 * (the passage's own bos+eos, which the special-cased sum above silently
 * assumed but a raw content count does not include). This was verified
 * end-to-end against the real server: truncating to exactly that budget
 * produced a combined request of EXACTLY 512 tokens with no error, and
 * truncating one token short of it (using the wrong, off-by-2 budget)
 * reproduced the 500 with a reported 514.
 */

import { CrossEncoderError, sigmoid, type CrossEncoderProvider, type CrossEncoderScore } from "./cross-encoder.js";
import type { ProviderFidelity } from "../evidence-tier.js";

/** The sidecar refused the connection, or responded with a non-2xx status. */
export class CrossEncoderUnavailableError extends Error {
  override readonly name = "CrossEncoderUnavailableError";
}

/** The sidecar did not respond within the request's `timeoutMs` budget. */
export class CrossEncoderTimeoutError extends Error {
  override readonly name = "CrossEncoderTimeoutError";
}

export interface CrossEncoderTruncationInfo {
  /** Index into the `passages` argument of the `score()` call this truncation happened during. */
  readonly index: number;
  readonly originalTokens: number;
  readonly truncatedTokens: number;
}

export interface HttpCrossEncoderProviderOptions {
  readonly serverUrl: string;
  /** Defaults to `"bge-reranker-v2-m3"` — the model this class was written against (ADR 0009 D3). */
  readonly model?: string;
  /**
   * The model's own context budget for `query + passage` combined. Defaults
   * to `512`, this model's measured `n_ctx_seq` (see this file's header).
   * Overridable only so tests can exercise the truncation path with small
   * numbers instead of building 512-token fixtures.
   */
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  /** Overridden by tests to avoid a real network call. */
  readonly fetchImpl?: typeof fetch;
  /**
   * Invoked synchronously, once per passage, whenever that passage had to be
   * shortened to fit `maxTokens`. This is the "record it, don't let it
   * happen silently" half of ADR 0009 R2 — `CrossEncoderScore.truncated`
   * tells a caller AFTER the fact that scoring happened on shortened text;
   * this callback is for a caller (e.g. request logging) that wants to know
   * WHICH passage and by how much, at the moment it happens.
   */
  readonly onTruncated?: (info: CrossEncoderTruncationInfo) => void;
}

const DEFAULT_MODEL = "bge-reranker-v2-m3";
const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_TIMEOUT_MS = 30_000;
/**
 * `tokenize(text, add_special=true).length - tokenize(text, add_special=false).length`
 * for this tokenizer — the bos+eos a passage's OWN special-cased tokenization
 * counts that the combined-prompt formula's cancellation (see file header)
 * does not actually spend on the passage. Measured, not assumed: verified by
 * truncating to `maxTokens - Q - PASSAGE_BOS_EOS_TOKENS` and observing the
 * server accept a combined request of EXACTLY `maxTokens` tokens.
 */
const PASSAGE_BOS_EOS_TOKENS = 2;

interface TokenizeResponseBody {
  readonly tokens: readonly number[];
}
interface DetokenizeResponseBody {
  readonly content: string;
}
interface RerankResultEntry {
  readonly index: number;
  readonly relevance_score: number;
}
interface RerankResponseBody {
  readonly results: readonly RerankResultEntry[];
}

/**
 * Real adapter: `POST {serverUrl}/rerank` (`/tokenize` and `/detokenize` for
 * the proactive token-budget check above). See this file's header for the
 * measured shapes and formulas.
 */
export class HttpCrossEncoderProvider implements CrossEncoderProvider {
  readonly componentId = "cross-encoder:http";
  readonly fidelityCeiling: ProviderFidelity = "PF2";
  readonly model: string;

  private readonly serverUrl: string;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly onTruncated: ((info: CrossEncoderTruncationInfo) => void) | undefined;

  constructor(options: HttpCrossEncoderProviderOptions) {
    this.serverUrl = options.serverUrl;
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.onTruncated = options.onTruncated;
  }

  async score(query: string, passages: readonly string[]): Promise<readonly CrossEncoderScore[]> {
    if (typeof query !== "string" || query.trim() === "") {
      throw new CrossEncoderError("query 不得為空字串——沒有語意可送去重排。");
    }
    if (passages.length === 0) {
      return [];
    }

    const queryTokens = await this.tokenize(query, true);
    const contentBudget = this.maxTokens - queryTokens.length - PASSAGE_BOS_EOS_TOKENS;
    if (contentBudget <= 0) {
      throw new CrossEncoderError(
        `query 本身已佔 ${queryTokens.length} tokens,加上結構 token 後已達或超過模型上限 ` +
          `${this.maxTokens},沒有剩餘預算放任何 passage——這個 query 太長,無法送去重排,` +
          `必須拒絕而不是送出一個保證失敗或保證錯誤截斷 passage 的請求。`,
      );
    }

    const truncatedFlags: boolean[] = new Array(passages.length).fill(false);
    const documents = await Promise.all(
      passages.map(async (passage, index) => {
        const contentTokens = await this.tokenize(passage, false);
        if (contentTokens.length <= contentBudget) {
          return passage;
        }

        const truncatedTokens = contentTokens.slice(0, contentBudget);
        const truncatedText = await this.detokenize(truncatedTokens);
        truncatedFlags[index] = true;
        this.onTruncated?.({
          index,
          originalTokens: contentTokens.length,
          truncatedTokens: truncatedTokens.length,
        });
        return truncatedText;
      }),
    );

    const response = await this.postRerank(query, documents);
    return this.alignResults(response, passages.length, truncatedFlags);
  }

  /**
   * Realigns the server's score-sorted `results` (each carrying the ORIGINAL
   * `documents` position as `index`) back into the order `score()`'s
   * `passages` argument was given in — see `cross-encoder.ts`'s header for
   * why this is the entire point of this class rather than an
   * implementation detail. Validates coverage (every index appears EXACTLY
   * once) rather than trusting the server's batch to be well-formed, because
   * a partially-wrong response here would silently score some passages with
   * someone else's number.
   */
  private alignResults(
    response: RerankResponseBody,
    passageCount: number,
    truncatedFlags: readonly boolean[],
  ): readonly CrossEncoderScore[] {
    if (!Array.isArray(response.results) || response.results.length !== passageCount) {
      throw new CrossEncoderError(
        `重排伺服器回傳 ${Array.isArray(response.results) ? response.results.length : "非陣列"} 筆結果,` +
          `與送出的 ${passageCount} 筆 passage 數量不符——不得用位置猜測對應關係,直接拒絕整批結果。`,
      );
    }

    const aligned: (CrossEncoderScore | undefined)[] = new Array(passageCount);
    const seenIndexes = new Set<number>();

    for (const result of response.results) {
      const index = result.index;
      const rawScore = result.relevance_score;

      if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= passageCount) {
        throw new CrossEncoderError(
          `重排伺服器回傳的 index (${JSON.stringify(index)}) 超出送出的 passage 範圍 [0, ${passageCount})。`,
        );
      }
      if (seenIndexes.has(index)) {
        throw new CrossEncoderError(`重排伺服器對 index ${index} 回傳了不只一筆分數——結果不可信,拒絕使用。`);
      }
      if (typeof rawScore !== "number" || !Number.isFinite(rawScore)) {
        throw new CrossEncoderError(`重排伺服器對 index ${index} 回傳的 relevance_score 不是有限數字:${JSON.stringify(rawScore)}`);
      }

      seenIndexes.add(index);
      aligned[index] = {
        relevanceScore: sigmoid(rawScore),
        rawScore,
        truncated: truncatedFlags[index] ?? false,
      };
    }

    if (seenIndexes.size !== passageCount) {
      const missing: number[] = [];
      for (let i = 0; i < passageCount; i += 1) {
        if (!seenIndexes.has(i)) missing.push(i);
      }
      throw new CrossEncoderError(
        `重排伺服器沒有回傳全部 passage 的分數,缺少 index:${missing.join(", ")}。不得用「有拿到一些結果」` +
          `冒充「拿到全部結果」。`,
      );
    }

    return aligned as CrossEncoderScore[];
  }

  private async tokenize(content: string, addSpecial: boolean): Promise<readonly number[]> {
    const body = await this.postJson<TokenizeResponseBody>("/tokenize", { content, add_special: addSpecial });
    if (!Array.isArray(body.tokens)) {
      throw new CrossEncoderError("重排伺服器 /tokenize 回應缺少 tokens 陣列——無法量測 token 數,拒絕猜測。");
    }
    return body.tokens;
  }

  private async detokenize(tokens: readonly number[]): Promise<string> {
    const body = await this.postJson<DetokenizeResponseBody>("/detokenize", { tokens });
    if (typeof body.content !== "string") {
      throw new CrossEncoderError("重排伺服器 /detokenize 回應缺少 content 字串。");
    }
    return body.content;
  }

  private async postRerank(query: string, documents: readonly string[]): Promise<RerankResponseBody> {
    return this.postJson<RerankResponseBody>("/rerank", { query, documents });
  }

  private async postJson<T>(path: string, payload: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.serverUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new CrossEncoderTimeoutError(`重排伺服器 ${path} 逾時(${this.timeoutMs}ms)。`);
      }
      throw new CrossEncoderUnavailableError(
        `重排伺服器目前無法使用(${path}):${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        // best-effort only — the status code alone is still informative.
      }
      throw new CrossEncoderUnavailableError(`重排伺服器 ${path} 回傳 HTTP ${response.status}:${detail.slice(0, 500)}`);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new CrossEncoderError(`重排伺服器 ${path} 回應不是合法 JSON。`);
    }
  }
}
