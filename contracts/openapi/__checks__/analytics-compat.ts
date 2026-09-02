/**
 * E13-S018 Functional AC1 — typecheck-only proof that
 * `contracts/openapi/analytics.yaml` produces types compatible with the
 * shapes the services that actually implement it return, and that its
 * client-facing input schemas stay fail-closed on server-derived identity.
 *
 * REPOINTED (E04-S069, evidence from E04-S064's `generation-compat.ts`
 * repoint): this file used to import `FeedbackItem` from
 * `apps/admin/src/lib/feedback.js` — the ADMIN FRONTEND's own hand-written
 * mirror, not the seam that implements the route.
 *
 * `GET /admin/feedback` and `GET /admin/feedback/{messageId}`
 * (`services/feedback/src/routes/admin-feedback.ts`) are mounted by
 * `services/feedback` but the cross-owner read model they call —
 * `adminListMessagesWithFeedback`/`adminGetMessage`, and the
 * `AdminFeedbackItem`/`AdminFeedbackPage` types they return — is exported
 * by `@ai-km/service-conversation` (`services/conversation/src/repository/
 * admin-read.repository.ts`; see that file's own header for why the
 * cross-owner query lives with the `messages` table it reads, not with the
 * feedback-submission endpoints). `admin-feedback.ts` imports those types
 * and returns them VERBATIM (`return item`) — no reshaping — so THAT is
 * what this file now binds `FeedbackItem` to. This is not a Team B edit:
 * both types were already exported before this story; only this file's
 * import changed. `POST /usage-events` (`services/feedback/src/routes/
 * usage-events.ts`) does live entirely in `services/feedback`, and its
 * `UsageEventName` is bound to that package's own
 * `repository/usage-events.repository.ts` export, replacing a hand-written
 * `UsageEventNameWhitelist` literal that this file used to duplicate the
 * enum with instead of importing the real one — the same class of mistake
 * this whole story exists to remove, just smaller.
 *
 * Never executed, never bundled. See ./README.md for the commands.
 */
import type { components } from "./generated/analytics.js";
import type {
  AdminFeedbackCitationVerdict,
  AdminFeedbackItem,
  AdminFeedbackPage,
} from "../../../services/conversation/src/repository/admin-read.repository.js";
import type {
  LatencyMetrics,
  UsageEventName,
  UsageMetrics,
} from "../../../services/feedback/src/repository/usage-events.repository.js";

type Schemas = components["schemas"];

type AssignableTo<A extends B, B> = A extends B ? true : never;
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/*
 * ── FeedbackItem, field by field ─────────────────────────────────────────
 *
 * WHY FIELD BY FIELD, NOT ONE WHOLE-OBJECT CHECK (repoint finding, same
 * shape as `generation-compat.ts`'s own comment on this): a single
 * `AssignableTo<Schemas["FeedbackItem"], AdminFeedbackItem>` does not
 * compile, for a reason that was a genuine divergence at the time this file
 * was repointed (`reason`'s contract/implementation mismatch — see
 * `reasonExact` below), since resolved by E04-S071. Kept field by field
 * regardless: `citationFeedback`'s readonly-array technicality
 * (`citationVerdictAssignable` below) still holds independently.
 */

export const idExact: Exact<Schemas["FeedbackItem"]["id"], AdminFeedbackItem["id"]> = true;
export const verdictExact: Exact<Schemas["FeedbackItem"]["verdict"], AdminFeedbackItem["verdict"]> = true;
export const submittedAtExact: Exact<Schemas["FeedbackItem"]["submittedAt"], AdminFeedbackItem["submittedAt"]> =
  true;
export const messageIdExact: Exact<Schemas["FeedbackItem"]["messageId"], AdminFeedbackItem["messageId"]> = true;
export const conversationIdExact: Exact<
  Schemas["FeedbackItem"]["conversationId"],
  AdminFeedbackItem["conversationId"]
> = true;
export const answerExcerptExact: Exact<
  Schemas["FeedbackItem"]["answerExcerpt"],
  AdminFeedbackItem["answerExcerpt"]
> = true;
export const commentExact: Exact<Schemas["FeedbackItem"]["comment"], AdminFeedbackItem["comment"]> = true;

/**
 * CONTRACT LOOSE / IMPLEMENTATION STRICT — RESOLVED by E04-S071: this used
 * to be a one-directional `AssignableTo<AdminFeedbackItem["reason"],
 * Schemas["FeedbackItem"]["reason"]>`, because `analytics.yaml`'s
 * `FeedbackItem.reason` was an unconstrained `type: string` while the REAL
 * implementation (`AdminFeedbackItem.reason`, `services/conversation/src/
 * repository/admin-read.repository.ts`) always supplies one of exactly the
 * four `FeedbackReason` literals (`INCORRECT`/`INCOMPLETE`/`OFF_TOPIC`/
 * `OTHER`) — the SAME enum `conversations.yaml` already declares and
 * `conversations-compat.ts` checks. That one-directional check could never
 * go red from this field alone: it stayed true whether the contract's
 * `reason` was `string` or the tightened enum, so it did not actually prove
 * the contract matched the implementation, only that the implementation's
 * values happened to fit inside whatever the contract allowed.
 *
 * E04-S071 tightened `analytics.yaml`'s `FeedbackItem.reason` to an inline
 * `enum: [INCORRECT, INCOMPLETE, OFF_TOPIC, OTHER]` (not a `$ref` to
 * `conversations.yaml`'s `FeedbackReason` — that would add a cross-file
 * reference this story's contract diff does not make), so the contract's
 * `reason` type is now EXACTLY `AdminFeedbackItem["reason"]`. `reasonExact`
 * below asserts both directions.
 */
export const reasonExact: Exact<Schemas["FeedbackItem"]["reason"], AdminFeedbackItem["reason"]> = true;

/**
 * `citationFeedback`'s ELEMENT type, not the whole array: `AdminFeedbackItem
 * .citationFeedback` is `readonly AdminFeedbackCitationVerdict[]`, and
 * TypeScript never considers a `readonly T[]` assignable to the generated
 * schema's mutable `T[]` regardless of how compatible `T` is — the same
 * array-readonly technicality `generation-compat.ts`'s own comment
 * documents for `citationsElementAssignable`. Checking the element proves
 * what this seam actually needs proven without tripping over it.
 */
export const citationVerdictAssignable: AssignableTo<
  AdminFeedbackCitationVerdict,
  Schemas["FeedbackCitationVerdict"]
> = true;

/**
 * Value-level smoke check, schema side: a contract-conformant literal must
 * be constructible from the schema's own required/optional field list. Used
 * to be deliberately NOT cross-assignable to `AdminFeedbackItem` — before
 * E04-S071, a literal `"INCORRECT"` typed via `Schemas["FeedbackItem"]
 * ["reason"]` widened to plain `string`, which was not assignable to
 * `AdminFeedbackItem["reason"]`'s `FeedbackReason` (see `reasonExact`
 * above). That asymmetry is gone now that `reason` is exact both ways.
 */
const feedbackItemSample: Schemas["FeedbackItem"] = {
  id: "fb-0001",
  verdict: "ng",
  reason: "INCORRECT",
  comment: "保固期數字錯了。",
  citationFeedback: [{ citationId: "1", verdict: "ok" }],
  submittedAt: "2026-08-28T05:15:00.000Z",
  messageId: "1b6a1f2c-3d4e-4f50-8a61-7c8d9e0f1a2b",
  conversationId: "8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77",
  answerExcerpt: "保固期從出貨日起算 12 個月。[1]",
};
export const feedbackItem: Schemas["FeedbackItem"] = feedbackItemSample;

/** A feedback item with only the required fields must still satisfy the contract's own type. */
const minimalFeedbackItemSample: Schemas["FeedbackItem"] = {
  id: "fb-0002",
  verdict: "ok",
  submittedAt: "2026-08-28T05:15:00.000Z",
  messageId: "1b6a1f2c-3d4e-4f50-8a61-7c8d9e0f1a2b",
  conversationId: "8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77",
  answerExcerpt: "保固期從出貨日起算 12 個月。",
};
export const minimalFeedbackItem: Schemas["FeedbackItem"] = minimalFeedbackItemSample;

/**
 * Value-level smoke check, implementation side: a literal shaped like what
 * `adminListMessagesWithFeedback`/`adminGetMessage` actually construct must
 * be usable everywhere the contract's `FeedbackItem` is expected. Both this
 * and `feedbackItemSample` above are now mutually cross-assignable for
 * `reason` (see `reasonExact`) — this smoke check predates that and is kept
 * for the fields `reasonExact` does not cover as object-literal shape.
 * `citationFeedback` is left out here on purpose: `AdminFeedbackItem
 * .citationFeedback` is `readonly AdminFeedbackCitationVerdict[]`, and a
 * value of a `readonly T[]`-typed variable is never assignable to a
 * mutable-`T[]`-typed one regardless of how compatible `T` is — the same
 * technicality `citationVerdictAssignable` above already covers at the
 * element level, so re-asserting it here at the container level would only
 * fail to compile without proving anything new.
 */
const implFeedbackItemSample: Omit<AdminFeedbackItem, "citationFeedback"> = {
  id: "fb-0001",
  verdict: "ng",
  reason: "INCORRECT",
  comment: "保固期數字錯了。",
  submittedAt: "2026-08-28T05:15:00.000Z",
  messageId: "1b6a1f2c-3d4e-4f50-8a61-7c8d9e0f1a2b",
  conversationId: "8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77",
  answerExcerpt: "保固期從出貨日起算 12 個月。[1]",
};
export const implFeedbackItemSatisfiesContract: Schemas["FeedbackItem"] = implFeedbackItemSample;

/*
 * ── FeedbackQueuePage (E04-S080) ──────────────────────────────────────────
 *
 * `GET /admin/feedback` (`admin-feedback.ts`) returns
 * `adminListMessagesWithFeedback`'s result VERBATIM — `AdminFeedbackPage`
 * — so, as with `FeedbackItem` above, this is a RESPONSE the server
 * produces: the meaningful direction is IMPLEMENTATION → CONTRACT (whatever
 * the repository actually returns must satisfy what the contract promises
 * the admin UI), the same direction `generation-compat.ts`'s
 * `answerAssignable`/`citationsElementAssignable` use for the same reason.
 *
 * The page-metadata fields (`page`/`pageSize`/`totalCount`/`totalPages`) are
 * plain `number`s on both sides with no array involved, so a direct
 * `Exact` here would hold — but per this story's rule against reaching for
 * `Exact` reflexively, `AssignableTo` already proves the property that
 * matters (the repository always supplies a value the contract's fields can
 * hold) without also demanding the contract could never legitimately need a
 * WIDER numeric type than the implementation happens to use today.
 */
export const feedbackQueuePagePageAssignable: AssignableTo<
  AdminFeedbackPage["page"],
  Schemas["FeedbackQueuePage"]["page"]
> = true;
export const feedbackQueuePagePageSizeAssignable: AssignableTo<
  AdminFeedbackPage["pageSize"],
  Schemas["FeedbackQueuePage"]["pageSize"]
> = true;
export const feedbackQueuePageTotalCountAssignable: AssignableTo<
  AdminFeedbackPage["totalCount"],
  Schemas["FeedbackQueuePage"]["totalCount"]
> = true;
export const feedbackQueuePageTotalPagesAssignable: AssignableTo<
  AdminFeedbackPage["totalPages"],
  Schemas["FeedbackQueuePage"]["totalPages"]
> = true;

/**
 * `items`, element by element, EXCLUDING `citationFeedback` — for two
 * independent reasons this file already establishes elsewhere, stacked on
 * top of each other here:
 *
 * 1. `AdminFeedbackPage["items"]` is `readonly AdminFeedbackItem[]`; a
 *    `readonly T[]` is never assignable to the generated schema's mutable
 *    `T[]` regardless of how compatible `T` is (the same technicality
 *    `citationsElementAssignable`/`citationVerdictAssignable` document), so
 *    the ELEMENT is checked, not the container.
 * 2. Even at the element level, `AdminFeedbackItem["citationFeedback"]` is
 *    itself `readonly AdminFeedbackCitationVerdict[]` — the SAME technicality
 *    one field deeper — which is why `citationVerdictAssignable` above
 *    already checks it independently, at ITS OWN element type. Re-including
 *    `citationFeedback` here would just fail to compile a second time
 *    without proving anything `citationVerdictAssignable` does not already
 *    prove, so it is excluded with `Omit`, matching `implFeedbackItemSample`'s
 *    own `Omit<AdminFeedbackItem, "citationFeedback">` above for the same
 *    reason.
 */
export const feedbackQueuePageItemAssignable: AssignableTo<
  Omit<AdminFeedbackPage["items"][number], "citationFeedback">,
  Omit<Schemas["FeedbackQueuePage"]["items"][number], "citationFeedback">
> = true;

/**
 * Security — `UsageEventInput` must never be able to carry a
 * caller-asserted identity field. Resolves to `never` if `userId` (or any
 * other owner-naming field) appears, same pattern `auth.yaml`'s
 * `LoginRequest` check already establishes. Schema-only: no implementation
 * binding needed.
 */
type OwnerFreeKeys<T> = Extract<keyof T, "userId" | "ownerKey" | "ownerId" | "owner">;
type OwnerFree<T> = [OwnerFreeKeys<T>] extends [never] ? true : never;

export const usageEventInputOwnerFree: OwnerFree<Schemas["UsageEventInput"]> = true;

/**
 * Functional AC — `UsageEventName` must be exactly the real whitelist
 * `services/feedback`'s own `usage-events.repository.ts` declares: narrower
 * would make an event the implementation already records unrepresentable;
 * wider would let this contract invent a value nothing in the codebase
 * produces. Bound to the REAL export now, not a hand-copied
 * `UsageEventNameWhitelist` literal duplicating the same three strings.
 */
export const usageEventNameExact: Exact<Schemas["UsageEventName"], UsageEventName> = true;

const usageEventInputSample: Schemas["UsageEventInput"] = {
  name: "rag_answer_outcome",
  conversationId: "8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77",
  answerState: "ANSWERED",
  citationCount: 2,
  latencyMs: 1450,
  occurredAt: "2026-08-28T05:12:04.000Z",
};
export const usageEventInput: Schemas["UsageEventInput"] = usageEventInputSample;

const minimalUsageEventInputSample: Schemas["UsageEventInput"] = {
  name: "conversation_created",
  occurredAt: "2026-08-28T05:12:00.000Z",
};
export const minimalUsageEventInput: Schemas["UsageEventInput"] = minimalUsageEventInputSample;

/** Zero-sample latency must be representable as `null`, not forced to `0`. Schema-only smoke check. */
const zeroSampleLatencySample: Schemas["LatencyMetrics"] = {
  averageLatencyMs: null,
  sampleCount: 0,
};
export const zeroSampleLatency: Schemas["LatencyMetrics"] = zeroSampleLatencySample;

/*
 * ── UsageMetrics / LatencyMetrics (E04-S080) ─────────────────────────────
 *
 * `GET /admin/metrics/usage` and `GET /admin/metrics/latency`
 * (`admin-metrics.ts`) return `computeUsageMetrics`/`computeLatencyMetrics`'s
 * result VERBATIM (`return computeUsageMetrics(...)`, no reshaping) —
 * responses the server produces, so, same reasoning as `FeedbackQueuePage`
 * above and `generation-compat.ts`'s response checks, the meaningful
 * direction is IMPLEMENTATION → CONTRACT: whatever the repository computes
 * must satisfy what the contract promises the admin dashboard. Whole-object
 * checks, not field-by-field — neither type has an array field, so the
 * `readonly T[]` technicality that forces a split elsewhere never arises
 * here.
 *
 * Not `Exact`: both shapes happen to match field-for-field today, but
 * nothing about this seam requires the CONTRACT to be incapable of ever
 * legitimately promising a wider numeric type than the SQL aggregation
 * currently returns (e.g. `AVG()` already yields `number | null` — a
 * `bigint` count would still satisfy `AssignableTo` here without this file
 * needing to change). Reserving `Exact` for cases that genuinely require
 * two-way equality, such as the enum checks elsewhere in this file.
 */
export const usageMetricsAssignable: AssignableTo<UsageMetrics, Schemas["UsageMetrics"]> = true;
export const latencyMetricsAssignable: AssignableTo<LatencyMetrics, Schemas["LatencyMetrics"]> = true;
