/**
 * 2026-09-02 assignment (E04-S069) — typecheck-only proof that
 * `contracts/openapi/embedding.yaml` stays compatible with the seam that
 * actually implements `POST /v1/embeddings`.
 *
 * REPOINTED (E04-S069, evidence from E04-S064's `generation-compat.ts`
 * repoint): this file used to import `Embedding`/`EmbeddingProvider` from
 * `services/retrieval/src/embedding/provider.ts`. That is the CONSUMER of
 * embeddings — the retrieval pipeline that calls the model — not the seam
 * that implements the route. `embedding.yaml` describes Model Gateway's
 * `POST /v1/embeddings`, so this file now binds to
 * `services/model-gateway/src/gateway.ts`'s `EmbedRequest`/`EmbedResponse`:
 * `registerEmbeddingRoutes` (`services/model-gateway/src/routes/
 * model-gateway-routes.ts`) calls `options.gateway.embed(...)` and returns
 * its result VERBATIM — no reshaping between `EmbedResponse` and the wire.
 * That is a more direct bind than the gateway's own `EmbeddingProvider`
 * (`./embedding/provider.ts`), which is one layer further in (the seam
 * between the gateway and the underlying model, not between the gateway and
 * the wire) — same reasoning 鐵律 #2 applies elsewhere in this directory:
 * bind what actually serialises, not an internal type that merely resembles
 * it.
 *
 * Evidence layer: **policy L0** (static — typecheck only). This file is never
 * executed and never bundled; it proves shape compatibility and nothing else.
 * No provider is involved, so it carries no Provider Fidelity (PF) tag — see
 * `services/retrieval/src/evidence-tier.ts` for why the two axes are named
 * apart. Serialisation over a real socket is policy L2/L3 at PF2; vector
 * quality is policy L6 at PF3. Neither is in reach here.
 *
 * See ./README.md for the commands.
 */
import type { components } from "./generated/embedding.js";
import type { EmbedRequest, EmbedResponse } from "../../../services/model-gateway/src/gateway.js";

type Schemas = components["schemas"];

type AssignableTo<A extends B, B> = A extends B ? true : never;
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * What a contract-conformant request supplies must be usable everywhere the
 * gateway's own `embed()` expects its `input` field. `EmbedRequest["input"]`
 * is `readonly string[]`; a plain (mutable) `string[]` from the generated
 * schema is assignable to that without friction (mutable → readonly always
 * is), unlike the reverse.
 */
export const inputAcceptsBatch: AssignableTo<
  Schemas["EmbeddingRequest"]["input"],
  EmbedRequest["input"]
> = true;

/**
 * `dimensions` is REQUIRED in the response, and is the same kind of value
 * the gateway actually returns. A response that omitted it would force the
 * store to infer dimensionality from the first vector it happened to
 * receive — which is exactly how a re-index event turns into silently wrong
 * rankings instead of a loud failure.
 */
export const dimensionsExact: Exact<Schemas["EmbeddingResponse"]["dimensions"], EmbedResponse["dimensions"]> =
  true;

/**
 * `index` is REQUIRED on every datum. The contract says `data` is in input
 * order; `index` is what lets a consumer verify that rather than trust it.
 */
export const dataIndexExact: Exact<
  Schemas["EmbeddingResponse"]["data"][number]["index"],
  number
> = true;

/**
 * The wire type of each embedding value the gateway returns is a plain
 * `number`, matching what the contract's `data[].embedding` items promise.
 *
 * WHY THIS IS NOT `wireVectorIsNotTypedArray` ANYMORE (E04-S069 repoint
 * finding): the pre-repoint version of this file asserted, at the CONSUMER
 * seam, that `services/retrieval`'s in-process `Embedding` (`Float32Array`)
 * was NOT assignable to the wire's `number[]` — guarding against
 * `JSON.stringify(new Float32Array(...))` silently serialising to
 * `{"0":1,"1":2}` (an object, not an array), which deserialises to a
 * zero-length vector that scores 0 against everything and reads as "no
 * matching documents" rather than as a bug.
 *
 * At THIS seam that risk is already closed at the type level, not merely
 * papered over at the wire: `EmbeddingProvider["embed"]`'s declared return
 * type (`services/model-gateway/src/embedding/provider.ts`) is
 * `Promise<EmbedResult>` with `vectors: readonly (readonly number[])[]` —
 * never `Float32Array` — and `deterministic.provider.ts`'s `embed()` does
 * the `Array.from` conversion internally before ever constructing that
 * value (see that file's own comment, which names this file directly).
 * There is no `Float32Array` anywhere in `EmbedRequest`/`EmbedResponse`/
 * `EmbedResult`'s type signatures for a type-level assertion to catch
 * regressing. Writing a `NotAssignableTo<Float32Array, ...>` check here
 * would be vacuous — it would always pass, including on a hypothetical
 * future regression, because nothing at this seam's TYPE level could ever
 * make it fail. A vacuous assertion is worse than none: it reads as
 * coverage it does not provide. Recorded here instead of asserted.
 */
export const embeddingElementAssignable: AssignableTo<
  EmbedResponse["data"][number]["embedding"][number],
  Schemas["EmbeddingResponse"]["data"][number]["embedding"][number]
> = true;

/**
 * Value-level smoke check: a literal shaped like a contract-conformant
 * request/response must be usable everywhere the gateway's own
 * `EmbedRequest`/`EmbedResponse` are expected. Catches required/optional
 * drift the pure type-level checks above would let through in the
 * "contract adds a required field" direction.
 */
const requestSample: Schemas["EmbeddingRequest"] = {
  input: ["幫我找上個月的維修紀錄", "maintenance log"],
};
export const request: Schemas["EmbeddingRequest"] = requestSample;
export const requestSatisfiesGateway: EmbedRequest = requestSample;

const responseSample: Schemas["EmbeddingResponse"] = {
  model: "embedding:deterministic",
  dimensions: 256,
  data: [{ index: 0, embedding: [0.1, -0.2] }],
};
export const response: Schemas["EmbeddingResponse"] = responseSample;
export const responseSatisfiesGateway: EmbedResponse = responseSample;

/**
 * Security — credentials travel in the `ai_km_session` cookie declared under
 * `securitySchemes`, never in the body. A body field able to carry one would
 * put it into request logs and into any provider-side prompt capture.
 */
type CredentialKeys<T> = Extract<
  keyof T,
  "token" | "sessionToken" | "accessToken" | "sessionId" | "apiKey"
>;
type CredentialFree<T> = [CredentialKeys<T>] extends [never] ? true : never;

export const requestCredentialFree: CredentialFree<Schemas["EmbeddingRequest"]> = true;
export const responseCredentialFree: CredentialFree<Schemas["EmbeddingResponse"]> = true;

/**
 * Security — the embedding model is NOT an authorization boundary. It must be
 * impossible to hand it a principal or a scope, because a field that exists
 * is a field someone will eventually filter on, and 鐵律 #2 puts authorization
 * before retrieval, not inside the model call.
 */
type ScopeKeys<T> = Extract<
  keyof T,
  "scopeKey" | "principalId" | "userId" | "ownerKey" | "roles" | "allowedScopeKeys"
>;
type ScopeFree<T> = [ScopeKeys<T>] extends [never] ? true : never;

export const requestScopeFree: ScopeFree<Schemas["EmbeddingRequest"]> = true;

/**
 * ── ERROR ENVELOPE ──────────────────────────────────────────────────────────
 *
 * Added after the 2026-09-02 Model-Gateway alignment, because its absence was
 * a real hole: this contract's envelope was changed from a nested
 * `{error: {code, message}}` to the platform-wide flat
 * `{code, message, details?}` (ADR 0003 §4, `core.yaml`), and **every
 * assertion in this file still passed**. Shape checks that never look at the
 * failure path do not cover the failure path.
 */
type ErrorEnvelopeKeys<T> = Extract<keyof T, "error">;
/** `never` if a nested `error` wrapper ever comes back. */
type FlatEnvelope<T> = [ErrorEnvelopeKeys<T>] extends [never] ? true : never;

export const validationErrorFlat: FlatEnvelope<Schemas["ValidationErrorBody"]> = true;
export const payloadTooLargeFlat: FlatEnvelope<Schemas["PayloadTooLargeBody"]> = true;
export const unavailableFlat: FlatEnvelope<Schemas["EmbeddingUnavailableBody"]> = true;

/**
 * The `code` of each body is a single literal, not `string`. A widened `code`
 * would let the gateway return anything on that status, and a consumer
 * branching on the code would silently stop matching.
 */
export const validationCodeExact: Exact<
  Schemas["ValidationErrorBody"]["code"],
  "VALIDATION_ERROR"
> = true;
export const payloadTooLargeCodeExact: Exact<
  Schemas["PayloadTooLargeBody"]["code"],
  "PAYLOAD_TOO_LARGE"
> = true;
export const unavailableCodeExact: Exact<
  Schemas["EmbeddingUnavailableBody"]["code"],
  "EMBEDDING_UNAVAILABLE"
> = true;

/** Every error body still carries a human-readable message. */
export const validationHasMessage: Exact<Schemas["ValidationErrorBody"]["message"], string> = true;
export const unavailableHasMessage: Exact<
  Schemas["EmbeddingUnavailableBody"]["message"],
  string
> = true;
