/**
 * `RetrievalService` — the in-process seam `services/generation` and the BFF
 * call (E04-S062). Replaces the E04-S058 scaffold now that E04-S060
 * (authorization scope), E04-S061 (vector store) and E04-S066 (leaf-module
 * relocation) all live in this package.
 *
 * Behaviour is copied deliberately from `@ai-km/rag-skeleton`'s
 * `RagPipeline.ask()` — embed the query, query the store WITH the scope,
 * re-assert no leak at this boundary too, return hits. That sequence is not
 * reinvented here; only the surrounding service shape is new.
 *
 * WHAT IS ALREADY DECIDED HERE, AND WHY (unchanged from the scaffold)
 *
 * `retrieve()` takes a `RetrievalScope` as an INPUT. It does not take a user
 * id, a session, or a principal, and it does not derive a scope internally —
 * user decision, 2026-09-02, recorded on E04-S062.
 *
 * That is not a style preference. Deriving the scope here would make this
 * service an authorization boundary, and then "which departments may this
 * person read" would have two answers: this one and E02's. `E04-S009` is the
 * story that owns the single answer, and it is `blocked-team-b` precisely
 * because E02 RBAC does not exist yet. A convenience mapping table here would
 * become the de-facto answer before the real one is written.
 *
 * The scope type itself is branded: only `toRetrievalScope()` can produce one,
 * so "I forgot to thread authorization through" is a compile error rather than
 * a runtime surprise.
 *
 * ── THE EMBEDDING-SHAPE DECISION (E04-S062, 2026-09-02) ─────────────────────
 *
 * `retrieve()` takes the raw question string and embeds it itself, calling
 * `createModelGateway().embed()` in-process (ADR 0007 §1's PRIMARY path) —
 * NOT a pre-computed vector supplied by the caller. This adds a workspace
 * dependency edge `service-retrieval -> service-model-gateway`.
 *
 * The alternative (`retrieve(queryVector, scope, topK)`, caller embeds) would
 * have kept this package at zero workspace dependencies, the state E04-S066
 * spent a whole story reaching. That is a real cost, not a free choice, and
 * `model-gateway` does not depend on `retrieval`, so this edge does not
 * reopen the cycle E04-S066 closed.
 *
 * Three things tipped it to embedding-in-service anyway:
 *
 *  1. `SOURCE_BASELINE.md` §10 Principle 2 draws Retrieval as ONE pipeline
 *     stage, not "vector search" plus a separate "query embedding" stage
 *     glued together by every caller. `E04-S010` ("query embedding adapter")
 *     sits inside E04 for the same reason — the roadmap already places this
 *     responsibility in this domain, not upstream of it.
 *  2. Whoever embeds the query MUST use the SAME provider that produced the
 *     stored vectors, or ranking degrades silently (see `evidence-tier.ts`'s
 *     PF1 limits and E06-S026, which is the story that makes that mismatch
 *     loud instead of silent). Centralising the call in ONE place — this
 *     service, exactly the same way `ModelGateway.embed()` is the one choke
 *     point ADR 0007 §1 wants for validation — means there is exactly one
 *     configuration to get right, not N call sites each independently
 *     choosing a provider. `retrieve(queryVector, ...)` would instead diffuse
 *     that risk across every future caller.
 *  3. `@ai-km/rag-skeleton`'s `RagPipeline.ask()` — this story's explicit
 *     reference for behaviour — already embeds the raw question inside the
 *     pipeline stage rather than asking its caller for a vector. Mirroring
 *     that here keeps one shape across the codebase instead of two.
 *
 * What this decision does NOT do: it does not make `retrieve()` an
 * authorization boundary (that is the scope decision above, untouched), and
 * it does not let this service pick which MODEL is used — that is still
 * `E04-S037` (Team B, hardware sizing) — it only decides WHERE the call to
 * whatever model is configured happens.
 *
 * WHAT THIS DECISION DOES NOT COVER — E06-S026's gap, honestly stated: even
 * with embedding centralised here, nothing in this file (or anywhere in this
 * package) checks that the vectors already sitting in the `VectorStore` were
 * produced by the SAME provider configuration as the one embedding the query
 * right now. `store.upsert()` is called by a wholly separate path (ingestion,
 * out of this story's scope) that this service has no visibility into. A
 * dimensions mismatch between the two IS caught — `dot()` in
 * `embedding/provider.ts` throws rather than silently scoring garbage, and
 * `service.test.ts` has a test proving that. A same-dimensions,
 * different-semantics mismatch (the more dangerous case: a provider or model
 * swap that happens to keep the vector length the same) is NOT catchable at
 * this layer — there is no metadata anywhere recording which provider/model
 * version produced a stored vector to compare against. That is exactly what
 * `E06-S026` ("embedding 模型／版本 metadata 落庫...查詢向量與索引向量版本不
 * 符時拒絕檢索") exists to close. This service does not attempt an interim
 * answer to that question, for the same reason it does not attempt an interim
 * answer to authorization scope: a temporary answer here becomes the
 * de-facto answer before the real one is written.
 */

import { createModelGateway } from "@ai-km/service-model-gateway/src/gateway.js";
import { createDeterministicEmbeddingProvider as createModelGatewayDeterministicProvider } from "@ai-km/service-model-gateway/src/embedding/deterministic.provider.js";
import type { GenerationProvider } from "@ai-km/service-model-gateway/src/generation/provider.js";

import { assertNoScopeLeak, type RetrievalScope } from "./authorization/scope.js";
import {
  createInMemoryVectorStore,
  type EmbeddingIdentity,
  type RetrievalHit,
  type VectorStore,
} from "./vector/store.js";
import type { EmbeddingProvider } from "./embedding/provider.js";
import { effectiveFidelity, type FidelityRatedComponent } from "./evidence-tier.js";

export class RetrievalServiceError extends Error {
  override readonly name = "RetrievalServiceError";
}

export interface RetrievalService extends FidelityRatedComponent {
  /**
   * Authorised retrieval. Embeds `question`, queries the store WITH `scope`
   * (pre-filter, see `vector/store.ts`), re-asserts no leak at this boundary
   * (post-assert, see `authorization/scope.ts`), and returns hits ordered
   * best-first. `scope` is REQUIRED and is never derived here — see this
   * file's header.
   */
  retrieve(question: string, scope: RetrievalScope, topK?: number): Promise<readonly RetrievalHit[]>;
}

export interface RetrievalServiceOptions {
  /** Defaults to a fresh, empty in-memory store. */
  readonly store?: VectorStore;
  /** Defaults to a model-gateway-backed deterministic (PF1) provider. */
  readonly embedding?: EmbeddingProvider;
  /**
   * E06-S026 — when `true`, `retrieve()` passes its own embedding provider's
   * identity (`{ model, dimensions }`) to `store.query()` as
   * `expectedIdentity`, so a store whose persisted vectors disagree with (or
   * never recorded) that identity makes retrieval THROW
   * (`EmbeddingVersionMismatchError`) instead of silently ranking by an
   * incompatible model. See `vector/store.ts`'s `EmbeddingIdentity` doc
   * comment for the full mechanism.
   *
   * REQUIRED — NOT optional, and there is no default (2026-09-02, technical
   * advisor review round 2). An earlier version of this field was optional
   * with `?? false`, on the reasoning that every pre-existing test predates
   * this concept and would break if the check were on by default. That
   * reasoning was correct and still holds — see the false/true call sites
   * below — but "optional with a silent off-default" has exactly the failure
   * shape this whole story exists to close: a future caller that simply
   * forgets this field gets protection turned off with no signal at all,
   * the same "nobody notices" mechanism as the embedding-version bug itself.
   * Making it required moves that failure from "silent at runtime" to "a
   * typecheck error", and it covers callers that do not exist yet (a future
   * worker, a new composition root) the same way a runtime default never
   * could.
   *
   * Every existing call site in this package's ALREADY-MERGED test suite
   * (`service.test.ts`, `plugin.test.ts`,
   * `rerank/retrieve-with-reranking.test.ts`) and in
   * `services/generation/src/rag-composition.test.ts` now passes `false`
   * explicitly — an honest statement that those fixtures predate this
   * concept and carry no identity metadata, not a silently-inherited
   * default. `plugin.ts`'s own default composition root — the actual thing a
   * future real caller (`apps/api`) would reach — passes `true` explicitly.
   * As of 2026-09-02 `services/retrieval`'s plugin is not registered into
   * `apps/api` at all (verified by grep — see EVIDENCE), so today's exposure
   * from any of this is zero either way; fixing the pre-existing test
   * fixtures to carry real identity so `true` can become the only value ever
   * written is a legitimate follow-up, deliberately left out of this story's
   * Change Budget.
   */
  readonly enforceEmbeddingVersion: boolean;
}

const DEFAULT_TOP_K = 4;

/**
 * Never invoked in practice — this adapter only ever calls `gateway.embed()`.
 * Throwing (rather than quietly stubbing an answer) turns a future wiring
 * mistake that reaches `.generate()` on this gateway into a loud failure
 * instead of a silently wrong one. Copied from
 * `@ai-km/rag-skeleton`'s `embedding/model-gateway-deterministic.provider.ts`,
 * which carries the same placeholder for the same reason: `createModelGateway`
 * requires a `generation` dependency even though this adapter only ever calls
 * `.embed()`.
 */
const UNUSED_GENERATION_PROVIDER: GenerationProvider = {
  name: "fake",
  model: "service-retrieval-embedding-only",
  fidelityCeiling: "PF0",
  async generate(): Promise<never> {
    throw new Error("此 adapter 只用於 embedding,generate() 不應被呼叫——這是接線錯誤。");
  },
};

/**
 * Adapter: this package's own `EmbeddingProvider` seam (`./embedding/
 * provider.ts`), backed by `createModelGateway().embed()` — the PRIMARY
 * in-process path, ADR 0007 §1. Deep imports rather than the package barrel
 * (`@ai-km/service-model-gateway`) for the same reason
 * `@ai-km/rag-skeleton`'s equivalent adapter uses them: that barrel's
 * `index.ts` re-exports `modelGatewayPlugin`, which pulls in the ASR route
 * module transitively, and this package's tsconfig turns on
 * `exactOptionalPropertyTypes` (model-gateway's own tsconfig does not),
 * surfacing a pre-existing, unrelated type error in that ASR code once it is
 * part of the same compilation unit (tracked as E12-S034). `gateway.ts`
 * itself only imports the embedding/generation provider modules — never the
 * ASR route — so importing it (and them) directly avoids dragging in code
 * this adapter has nothing to do with.
 */
export function createModelGatewayEmbeddingProvider(
  options: { readonly dimensions?: number } = {},
): EmbeddingProvider {
  const embedding = createModelGatewayDeterministicProvider(options);
  const gateway = createModelGateway({ embedding, generation: UNUSED_GENERATION_PROVIDER });

  return {
    componentId: "embedding:deterministic",
    fidelityCeiling: embedding.fidelityCeiling,
    dimensions: embedding.dimensions,
    // E06-S026 — the Model Gateway provider's own `model` string (e.g.
    // "embedding:deterministic"), NOT re-derived from a response: it is
    // static per configured provider, so reading it once here (rather than
    // from every `EmbedResponse.model`) is correct and avoids trusting a
    // per-call value for something that must not vary within one provider's
    // lifetime.
    model: embedding.model,

    async embed(texts) {
      const response = await gateway.embed(
        { input: texts },
        "service-retrieval:query-embedding",
      );
      // `EmbedResponse.data` is in input order (the contract guarantees it,
      // and `createModelGateway` builds it that way) — see
      // `contracts/openapi/embedding.yaml`.
      return response.data.map((d) => Float32Array.from(d.embedding));
    },
  };
}

/**
 * Builds the real `RetrievalService`. Both dependencies are injectable so
 * tests (and, later, a real deployment's composition root) can supply a
 * persistent store or a differently-configured provider without this file
 * knowing about either concern.
 */
export function createRetrievalService(options: RetrievalServiceOptions): RetrievalService {
  const store = options.store ?? createInMemoryVectorStore();
  const embedding = options.embedding ?? createModelGatewayEmbeddingProvider();
  const enforceEmbeddingVersion = options.enforceEmbeddingVersion;

  return {
    componentId: "retrieval:service",
    fidelityCeiling: effectiveFidelity([embedding, store]),

    async retrieve(question, scope, topK = DEFAULT_TOP_K) {
      if (typeof question !== "string" || question.trim() === "") {
        throw new RetrievalServiceError(
          "question 不得為空字串。空字串沒有語意可嵌入,不能靜默當成「查全部」或「查不到」。",
        );
      }

      const [queryVector] = await embedding.embed([question]);
      if (!queryVector) {
        throw new RetrievalServiceError(`${embedding.componentId} 未回傳查詢向量。`);
      }

      // E06-S026 — opt-in (see `RetrievalServiceOptions.enforceEmbeddingVersion`'s
      // doc comment for why this is not unconditional yet).
      const expectedIdentity: EmbeddingIdentity | undefined = enforceEmbeddingVersion
        ? { model: embedding.model, dimensions: embedding.dimensions }
        : undefined;

      // Scope goes INTO the query — see vector/store.ts's header.
      const hits = await store.query(queryVector, scope, topK, expectedIdentity);

      // Re-assert on the SERVICE boundary as well as the store boundary. A
      // future store implementation (or this one, mis-wired) is a new
      // opportunity to leak — see authorization/scope.ts's header for why
      // pre-filter alone is not enough. This call is the one the mandatory
      // reverse-verification test removes and restores.
      assertNoScopeLeak(scope, hits);

      return hits;
    },
  };
}
