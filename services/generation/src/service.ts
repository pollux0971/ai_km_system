/**
 * `GenerationService` — context builder + generation orchestration, sitting in
 * front of the Model Gateway. E04-S063 replaces the E04-S059 scaffold
 * (`GenerationNotImplementedError`) with the real implementation.
 *
 * The layering is the one `services/generation/README.md` already stated
 * before any of this existed:
 *
 *   services/retrieval → services/generation → model-gateway → provider
 *
 * Behaviour is copied deliberately from `@ai-km/rag-skeleton`'s
 * `RagPipeline.ask()` (this story's explicit reference) — this package picks
 * up exactly the second half of that pipeline: given hits `services/
 * retrieval`'s `retrieve()` (E04-S062) already produced, assemble a
 * generation request, call the Model Gateway, and hand back a grounded
 * answer. It does not retrieve anything itself.
 *
 * ── DECIDED, NOT RE-OPENED ───────────────────────────────────────────────
 *
 * 1. THROUGH THE MODEL GATEWAY, IN-PROCESS (ADR 0007 §1). Baseline §5 rule 28
 *    requires model calls to go through the gateway; this service never talks
 *    to a provider directly. Mirrors `services/retrieval/src/service.ts`'s own
 *    embedding adapter: build a `ModelGateway` around the configured
 *    generation provider (default: the canned PF1 provider), and call
 *    `gateway.generate()` — never `provider.generate()` directly. That call is
 *    also where `assertCitationsGrounded` lives (`@ai-km/service-model-
 *    gateway`'s `gateway.ts`); routing around it would routes around the
 *    grounding check too. See `answer()` below.
 *
 * 2. PROJECT `RetrievalHit` → `ContextChunk` FIELD BY FIELD. `RetrievalHit`
 *    carries `scopeKey`; `ContextChunk` must not (`contracts/openapi/
 *    __checks__/generation-compat.ts`). TypeScript will not catch a mistake
 *    here — `RetrievalHit` is structurally assignable to `ContextChunk` (it
 *    has every required field, plus `scopeKey` and a non-optional `score`),
 *    and excess-property checking only fires on object literals, so
 *    `JSON.stringify(hits)` (or a bare spread) compiles cleanly and would put
 *    a department identifier into a model prompt. `buildContext()` below
 *    lists every field explicitly instead.
 *
 * 3. NO RE-FILTERING BY SCOPE. Authorization is spent by the time context
 *    reaches here (鐵律 #2) — `services/retrieval`'s `retrieve()` already
 *    ran `assertNoScopeLeak` twice (store boundary + service boundary). This
 *    service does not call `assertNoScopeLeak` again and does not look at
 *    `scopeKey` at all; doing either would create a second place where
 *    visibility is decided.
 *
 * ── THE EMPTY-CONTEXT SHORT-CIRCUIT (inherited from E12-S033, not
 *    re-litigated) ─────────────────────────────────────────────────────────
 *
 * When `context` is empty, `answer()` returns a graceful empty result WITHOUT
 * calling the gateway. Deny-Wins (an authorised-but-empty retrieval) and a
 * genuinely empty store both land here with nothing to answer from. Calling
 * `gateway.generate()` with an empty context would instead hit
 * `GenerationNoContextError` — the right rule for a real inference call, but
 * the wrong shape for this seam, whose caller (eventually the BFF) needs a
 * graceful empty answer rather than a thrown 422. `@ai-km/rag-skeleton`'s
 * `RagPipeline.ask()` established this short-circuit; this file copies it
 * verbatim rather than re-deriving it.
 *
 * OPEN QUESTION, NOT SOLVED HERE: the empty-context branch returns free-text
 * Chinese that a UI cannot distinguish from a real answer. That gap is
 * `E04-S022` (Abstention decision — registered, provisionally heavyweight,
 * threshold a pending product decision). This file does not invent a
 * structured reason code for it.
 */

import { createModelGateway } from "@ai-km/service-model-gateway/src/gateway.js";
import { createCannedGenerationProvider } from "@ai-km/service-model-gateway/src/generation/canned.provider.js";
import type {
  Citation,
  ContextChunk,
  GenerationProvider as ModelGatewayGenerationProvider,
} from "@ai-km/service-model-gateway/src/generation/provider.js";
import type { EmbeddingProvider as ModelGatewayEmbeddingProvider } from "@ai-km/service-model-gateway/src/embedding/provider.js";
import type { RetrievalHit } from "@ai-km/service-retrieval/src/vector/store.js";

export class GenerationServiceError extends Error {
  override readonly name = "GenerationServiceError";
}

export interface GenerationAnswer {
  readonly answer: string;
  /** MUST be a subset of the chunkIds supplied in the context passed to `answer()`. */
  readonly citations: readonly Citation[];
}

export interface GenerationService {
  readonly componentId: string;
  /**
   * Assembles a generation request from already-authorised retrieval hits,
   * calls the Model Gateway, and returns a grounded answer.
   *
   * `context` is `services/retrieval`'s `retrieve()` output, taken as-is.
   * This method does not re-derive or re-check scope — see this file's
   * header, point 3.
   */
  answer(question: string, context: readonly RetrievalHit[]): Promise<GenerationAnswer>;
}

export interface GenerationServiceOptions {
  /**
   * The model-gateway `GenerationProvider` to wrap in a gateway. Defaults to
   * the canned PF1 provider. Tests inject a spy/rogue provider here to prove
   * scope projection, the fabricated-citation refusal, and the empty-context
   * short-circuit — all at this seam, not the gateway's own test suite.
   */
  readonly generation?: ModelGatewayGenerationProvider;
}

/**
 * Never invoked in practice — this service only ever calls `gateway.generate()`.
 * Throwing (rather than quietly stubbing a vector) turns a future wiring
 * mistake that reaches `.embed()` on this gateway into a loud failure instead
 * of a silently wrong one. Same placeholder, same reasoning, as
 * `services/retrieval/src/service.ts`'s `UNUSED_GENERATION_PROVIDER` and
 * `@ai-km/rag-skeleton`'s `model-gateway-canned.provider.ts`.
 */
const UNUSED_EMBEDDING_PROVIDER: ModelGatewayEmbeddingProvider = {
  name: "fake",
  model: "service-generation-generation-only",
  dimensions: 0,
  fidelityCeiling: "PF0",
  async embed(): Promise<never> {
    throw new Error("此服務只用於 generation,embed() 不應被呼叫——這是接線錯誤。");
  },
};

const PLACEHOLDER_CORRELATION_ID = "service-generation:answer";

/**
 * Explicit field-by-field projection — see this file's header, point 2.
 * Deliberately NOT a spread (`{...hit}`) and NOT `JSON.stringify(hits)`:
 * both would compile (structural assignability + excess-property checking
 * only firing on literals) while carrying `scopeKey` straight through to the
 * gateway and the provider.
 */
function buildContext(hits: readonly RetrievalHit[]): ContextChunk[] {
  return hits.map((hit) => ({
    chunkId: hit.chunkId,
    documentId: hit.documentId,
    text: hit.text,
    startOffset: hit.startOffset,
    endOffset: hit.endOffset,
    score: hit.score,
  }));
}

/**
 * Builds the real `GenerationService`. The generation provider is injectable
 * so tests (and, later, a real deployment's composition root) can supply a
 * differently-configured provider without this file knowing about it.
 */
export function createGenerationService(options: GenerationServiceOptions = {}): GenerationService {
  const generation = options.generation ?? createCannedGenerationProvider();
  const gateway = createModelGateway({ embedding: UNUSED_EMBEDDING_PROVIDER, generation });

  return {
    componentId: "generation:service",

    async answer(question, context) {
      if (typeof question !== "string" || question.trim() === "") {
        throw new GenerationServiceError(
          "question 不得為空字串。空字串沒有語意可回答,不能靜默當成任何一種答案。",
        );
      }

      if (context.length === 0) {
        // Short-circuit — see this file's header. Do NOT call the gateway
        // with an empty context; do not construct `chunks` at all, so there
        // is nothing for a rogue provider to be invoked with.
        return {
          answer: `沒有可引用的來源,無法回答:${question}`,
          citations: [],
        };
      }

      const chunks = buildContext(context);
      const response = await gateway.generate(
        { question, context: chunks },
        PLACEHOLDER_CORRELATION_ID,
      );

      return { answer: response.answer, citations: response.citations };
    },
  };
}
