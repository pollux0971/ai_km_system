/**
 * 2026-09-02 assignment — typecheck-only proof that
 * `contracts/openapi/generation.yaml` stays compatible with the generation
 * seam `services/rag-skeleton` already implements.
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
import type { components } from "./generated/generation.js";
import type {
  Citation,
  GenerationResult,
} from "../../../services/rag-skeleton/src/generation/provider.js";
import type { RetrievalHit } from "../../../services/retrieval/src/vector/store.js";

type Schemas = components["schemas"];

type AssignableTo<A extends B, B> = A extends B ? true : never;
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * The contract's citation must be EXACTLY the one the pipeline produces.
 * Assignability alone is not enough in either direction: a narrower contract
 * would make a citation the UI can already render unrepresentable, and a wider
 * one would leave the client with a field it never handles. Same argument as
 * `auth-compat.ts`'s `AuthErrorCode`.
 */
export const citationExact: Exact<Schemas["Citation"], Citation> = true;

/** A contract response must be usable everywhere a pipeline result is. */
export const responseAssignable: AssignableTo<Schemas["GenerationResponse"], GenerationResult> =
  true;

/**
 * `citations` is REQUIRED, not optional. An answer that may legitimately omit
 * the field is indistinguishable, at the type level, from an ungrounded one —
 * and the whole point of structural citations is that "no citations" has to be
 * a visible, checkable state rather than an absent key.
 */
export const citationsRequired: Exact<
  Schemas["GenerationResponse"]["citations"],
  Schemas["Citation"][]
> = true;

/**
 * THE ONE THAT MATTERS AT THIS SEAM — 鐵律 #2.
 *
 * `RetrievalHit` carries `scopeKey`; `ContextChunk` must not. Scope is decided
 * before retrieval and is spent by the time context is assembled, so sending
 * it onward would (a) put department identifiers into a model prompt and into
 * whatever the provider logs, and (b) invite a future implementation to treat
 * the generation call as a place where filtering happens. It is not.
 *
 * NOTE FOR WHOEVER WRITES THE L2 HTTP CLIENT: TypeScript will NOT catch the
 * mistake this guards against. `RetrievalHit` is structurally assignable to
 * `ContextChunk` (it has every required field, plus one), and excess-property
 * checking only fires on object literals — so `JSON.stringify(hits)` compiles
 * cleanly and puts `scopeKey` on the wire. The client must project explicitly,
 * field by field. The assertion below pins the contract side of that; the
 * runtime side needs a test.
 */
type ScopeKeys<T> = Extract<
  keyof T,
  "scopeKey" | "principalId" | "userId" | "ownerKey" | "roles" | "allowedScopeKeys"
>;
type ScopeFree<T> = [ScopeKeys<T>] extends [never] ? true : never;

export const contextChunkScopeFree: ScopeFree<Schemas["ContextChunk"]> = true;
export const citationScopeFree: ScopeFree<Schemas["Citation"]> = true;
export const requestScopeFree: ScopeFree<Schemas["GenerationRequest"]> = true;

/** The scope key really is present on the in-process type — so the above is a live risk, not a hypothetical. */
export const retrievalHitCarriesScope: Exact<RetrievalHit["scopeKey"], string> = true;

/**
 * A citation points at a span in the ORIGINAL document; it must not carry the
 * text itself. A citation that carried its own text could quote something the
 * document does not say, and the offsets — the only thing the UI can verify
 * against the source — would stop being load-bearing.
 */
type ContentKeys<T> = Extract<keyof T, "text" | "answer" | "content" | "snippet">;
type ContentFree<T> = [ContentKeys<T>] extends [never] ? true : never;

export const citationContentFree: ContentFree<Schemas["Citation"]> = true;

/** Everything a citation needs is derivable from a hit, without inventing fields. */
export const chunkIdFromHit: AssignableTo<RetrievalHit["chunkId"], Schemas["Citation"]["chunkId"]> =
  true;
export const offsetsFromHit: AssignableTo<
  RetrievalHit["startOffset"],
  Schemas["Citation"]["startOffset"]
> = true;

/** A well-formed request, matching what the pipeline assembles after scope filtering. */
const requestSample: Schemas["GenerationRequest"] = {
  question: "上個月泵浦的維修紀錄?",
  context: [
    {
      chunkId: "doc-1#0",
      documentId: "doc-1",
      text: "泵浦於 8/12 更換軸封。",
      startOffset: 0,
      endOffset: 12,
      score: 0.91,
    },
  ],
};
export const request: Schemas["GenerationRequest"] = requestSample;

/** A well-formed response, matching what `testing/fake-generation-server.ts` writes. */
const responseSample: Schemas["GenerationResponse"] = {
  answer: "[canned] 依據 1 段來源回答:上個月泵浦的維修紀錄?",
  citations: [{ chunkId: "doc-1#0", documentId: "doc-1", startOffset: 0, endOffset: 12 }],
  model: "fake-canned",
};
export const response: Schemas["GenerationResponse"] = responseSample;

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
export const noContextFlat: FlatEnvelope<Schemas["GenerationNoContextBody"]> = true;
export const unavailableFlat: FlatEnvelope<Schemas["GenerationUnavailableBody"]> = true;

/**
 * The `code` of each body is a single literal, not `string`. A widened `code`
 * would let the gateway return anything on that status, and a consumer
 * branching on the code would silently stop matching.
 */
export const validationCodeExact: Exact<
  Schemas["ValidationErrorBody"]["code"],
  "VALIDATION_ERROR"
> = true;
export const noContextCodeExact: Exact<
  Schemas["GenerationNoContextBody"]["code"],
  "GENERATION_NO_CONTEXT"
> = true;
export const unavailableCodeExact: Exact<
  Schemas["GenerationUnavailableBody"]["code"],
  "GENERATION_UNAVAILABLE"
> = true;

/** Every error body still carries a human-readable message. */
export const validationHasMessage: Exact<Schemas["ValidationErrorBody"]["message"], string> = true;
export const noContextHasMessage: Exact<
  Schemas["GenerationNoContextBody"]["message"],
  string
> = true;
