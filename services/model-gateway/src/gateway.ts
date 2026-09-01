/**
 * The Model Gateway's in-process API — the PRIMARY path (user decision,
 * 2026-09-02).
 *
 * Baseline §5 rule 28 requires model calls to go THROUGH the gateway. It does
 * not say "over a socket", and §10 Principle 2 draws the gateway as a pipeline
 * STAGE, not a network hop. `apps/api` is a single process (ADR 0003 §1) with
 * every domain shipped as a Fastify plugin, so `services/retrieval` reaching
 * the gateway over HTTP would be a loopback call to itself: a serialisation
 * round trip, a second failure mode, and a second place for the behaviour to
 * live.
 *
 * So callers inside the process call these functions. `POST /v1/embeddings`
 * and `POST /v1/generate` (see `routes/`) parse a request, call THESE SAME
 * functions, and map the thrown errors to status codes. The routes hold no
 * behaviour of their own — that is what "thin wrapper" has to mean to be worth
 * anything. Two implementations behind one contract is how they drift, which
 * is the failure this whole exercise exists to stop.
 *
 * Validation lives here rather than in the routes for the same reason: an
 * in-process caller must get the identical guarantees an HTTP caller gets.
 * A limit enforced only at the HTTP edge is not enforced.
 */
import {
  EmbeddingUnavailableError,
  type EmbedResult,
  type EmbeddingProvider,
} from "./embedding/provider.js";
import {
  assertCitationsGrounded,
  GenerationUnavailableError,
  type Citation,
  type ContextChunk,
  type GenerationProvider,
} from "./generation/provider.js";

/**
 * Mirrors the constraints declared in `contracts/openapi/{embedding,
 * generation}.yaml`. Duplicated as constants the same way
 * `routes/transcriptions.ts` duplicates `MAX_AUDIO_BYTES` from its contract —
 * the contract stays the source of truth and the contract tests catch drift.
 */
const LIMITS = {
  embeddingMaxBatch: 256, // EmbeddingRequest.input maxItems
  embeddingMaxTextLength: 8192, // EmbeddingRequest.input.items maxLength
  generationMaxQuestion: 4096, // GenerationRequest.question maxLength
  generationMaxContext: 64, // GenerationRequest.context maxItems
} as const;

const DEFAULT_TIMEOUT_MS = 30000;

/** 400 — the request cannot be satisfied as written. */
export class ModelGatewayValidationError extends Error {
  override readonly name = "ModelGatewayValidationError";
}

/** 413 — well-formed, but larger than the provider accepts. */
export class ModelGatewayPayloadTooLargeError extends Error {
  override readonly name = "ModelGatewayPayloadTooLargeError";
}

/**
 * 422 — retrieval returned nothing usable.
 *
 * A distinct failure rather than an empty 200: the provider MUST NOT answer
 * from parametric knowledge, and an uncited answer in a knowledge-management
 * product is indistinguishable from a hallucination to the person reading it.
 */
export class GenerationNoContextError extends Error {
  override readonly name = "GenerationNoContextError";
}

export interface EmbedRequest {
  readonly input: readonly string[];
  readonly model?: string;
}
export interface EmbedResponse {
  readonly model: string;
  readonly dimensions: number;
  readonly data: ReadonlyArray<{ readonly index: number; readonly embedding: readonly number[] }>;
}
export interface GenerateRequest {
  readonly question: string;
  readonly context: readonly ContextChunk[];
  readonly model?: string;
}
export interface GenerateResponse {
  readonly answer: string;
  readonly citations: readonly Citation[];
  readonly model: string;
}

export interface ModelGateway {
  embed(request: EmbedRequest, correlationId: string): Promise<EmbedResponse>;
  generate(request: GenerateRequest, correlationId: string): Promise<GenerateResponse>;
  /** For diagnostics and `/v1/admin/health`; never used to make decisions. */
  readonly providers: {
    readonly embedding: Pick<EmbeddingProvider, "name" | "model" | "fidelityCeiling">;
    readonly generation: Pick<GenerationProvider, "name" | "model" | "fidelityCeiling">;
  };
}

export interface ModelGatewayDeps {
  readonly embedding: EmbeddingProvider;
  readonly generation: GenerationProvider;
  readonly timeoutMs?: number;
}

export function createModelGateway(deps: ModelGatewayDeps): ModelGateway {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    providers: {
      embedding: deps.embedding,
      generation: deps.generation,
    },

    async embed(request, correlationId) {
      const input = request.input;
      if (!Array.isArray(input) || input.length === 0) {
        throw new ModelGatewayValidationError("input 必須是至少含一個字串的陣列。");
      }
      if (input.length > LIMITS.embeddingMaxBatch) {
        throw new ModelGatewayPayloadTooLargeError(
          `一次最多只能嵌入 ${LIMITS.embeddingMaxBatch} 段文字,收到 ${input.length} 段。`,
        );
      }
      for (const [i, text] of input.entries()) {
        if (typeof text !== "string") {
          throw new ModelGatewayValidationError(`input[${i}] 必須是字串。`);
        }
        if (text.length > LIMITS.embeddingMaxTextLength) {
          throw new ModelGatewayValidationError(
            `input[${i}] 長度 ${text.length} 超過 ${LIMITS.embeddingMaxTextLength} 上限。`,
          );
        }
      }

      let result: EmbedResult;
      try {
        result = await deps.embedding.embed({
          texts: input,
          ...(request.model !== undefined ? { model: request.model } : {}),
          timeoutMs,
          correlationId,
        });
      } catch (error) {
        if (error instanceof EmbeddingUnavailableError) throw error;
        throw new EmbeddingUnavailableError("嵌入模型目前無法使用。");
      }

      // The contract says `data` is in input order and every datum carries its
      // index. A provider returning a different count would silently misalign
      // every downstream citation, so it is a failure, not a truncation.
      if (result.vectors.length !== input.length) {
        throw new EmbeddingUnavailableError(
          `嵌入結果數量 ${result.vectors.length} 與輸入 ${input.length} 不符,拒絕回傳錯位的向量。`,
        );
      }

      return {
        model: result.model,
        dimensions: result.dimensions,
        data: result.vectors.map((embedding, index) => ({ index, embedding })),
      };
    },

    async generate(request, correlationId) {
      if (typeof request.question !== "string" || request.question.trim() === "") {
        throw new ModelGatewayValidationError("question 不得為空。");
      }
      if (request.question.length > LIMITS.generationMaxQuestion) {
        throw new ModelGatewayValidationError(
          `question 長度 ${request.question.length} 超過 ${LIMITS.generationMaxQuestion} 上限。`,
        );
      }
      const context = request.context;
      if (!Array.isArray(context)) {
        throw new ModelGatewayValidationError("context 必須是陣列。");
      }
      if (context.length > LIMITS.generationMaxContext) {
        throw new ModelGatewayValidationError(
          `context 最多 ${LIMITS.generationMaxContext} 段,收到 ${context.length} 段。`,
        );
      }
      if (context.length === 0) {
        throw new GenerationNoContextError("沒有可引用的來源,無法作答。");
      }

      let result;
      try {
        result = await deps.generation.generate({
          question: request.question,
          context,
          ...(request.model !== undefined ? { model: request.model } : {}),
          timeoutMs,
          correlationId,
        });
      } catch (error) {
        if (error instanceof GenerationUnavailableError) throw error;
        throw new GenerationUnavailableError("生成模型目前無法使用。");
      }

      // Untrusted-provider check — see `assertCitationsGrounded`'s docstring.
      assertCitationsGrounded(context, result.citations);

      return { answer: result.answer, citations: result.citations, model: result.model };
    },
  };
}
