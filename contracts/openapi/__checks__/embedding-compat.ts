/**
 * 2026-09-02 assignment — typecheck-only proof that
 * `contracts/openapi/embedding.yaml` stays compatible with the embedding seam
 * `services/rag-skeleton` already implements.
 *
 * Evidence layer: **policy L0** (static — typecheck only). This file is never
 * executed and never bundled; it proves shape compatibility and nothing else.
 * No provider is involved, so it carries no Provider Fidelity (PF) tag — see
 * `services/rag-skeleton/src/evidence-tier.ts` for why the two axes are named
 * apart. Serialisation over a real socket is policy L2/L3 at PF2; vector
 * quality is policy L6 at PF3. Neither is in reach here.
 *
 * See ./README.md for the commands.
 */
import type { components } from "./generated/embedding.js";
import type {
  Embedding,
  EmbeddingProvider,
} from "../../../services/rag-skeleton/src/embedding/provider.js";

type Schemas = components["schemas"];

type AssignableTo<A extends B, B> = A extends B ? true : never;
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
/** Asserts a conversion is MANDATORY at this seam, not merely conventional. */
type NotAssignableTo<A, B> = [A] extends [B] ? never : true;

/** What the contract accepts must cover what `embed()` is willing to send. */
export const inputAcceptsBatch: AssignableTo<
  Schemas["EmbeddingRequest"]["input"],
  Parameters<EmbeddingProvider["embed"]>[0]
> = true;

/**
 * `dimensions` is REQUIRED in the response, and is the same kind of value the
 * provider declares. A response that omitted it would force the store to
 * infer dimensionality from the first vector it happened to receive — which
 * is exactly how a re-index event turns into silently wrong rankings instead
 * of a loud failure.
 */
export const dimensionsExact: Exact<
  Schemas["EmbeddingResponse"]["dimensions"],
  EmbeddingProvider["dimensions"]
> = true;

/**
 * `index` is REQUIRED on every datum. The contract says `data` is in input
 * order; `index` is what lets a consumer verify that rather than trust it.
 */
export const dataIndexExact: Exact<
  Schemas["EmbeddingResponse"]["data"][number]["index"],
  number
> = true;

/**
 * THE ONE THAT MATTERS AT THIS SEAM.
 *
 * In-process the vector is a `Float32Array`; on the wire the contract says
 * `number[]`. These are deliberately NOT interchangeable, and this assertion
 * pins that.
 *
 * `JSON.stringify(new Float32Array([1, 2]))` produces `{"0":1,"1":2}` — an
 * object, not an array. It does not throw, it does not warn, and the receiving
 * side gets a zero-length vector that scores 0 against everything, which reads
 * as "no matching documents" rather than as a bug. An explicit
 * `Array.from(vector)` at the boundary is therefore contractual, and this line
 * goes red if someone ever "simplifies" the wire type to accept the typed
 * array directly.
 */
export const wireVectorIsNotTypedArray: NotAssignableTo<
  Embedding,
  Schemas["EmbeddingResponse"]["data"][number]["embedding"]
> = true;

/** And the conversion's output is what the contract actually asked for. */
declare function toWire(vector: Embedding): number[];
export const conversionSatisfiesWire: AssignableTo<
  ReturnType<typeof toWire>,
  Schemas["EmbeddingResponse"]["data"][number]["embedding"]
> = true;

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

/** A well-formed request the deterministic and HTTP providers both produce. */
const requestSample: Schemas["EmbeddingRequest"] = {
  input: ["幫我找上個月的維修紀錄", "maintenance log"],
};
export const request: Schemas["EmbeddingRequest"] = requestSample;

/** A well-formed response, matching what `testing/fake-embedding-server.ts` writes. */
const responseSample: Schemas["EmbeddingResponse"] = {
  model: "fake-deterministic",
  dimensions: 256,
  data: [{ index: 0, embedding: [0.1, -0.2] }],
};
export const response: Schemas["EmbeddingResponse"] = responseSample;

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
