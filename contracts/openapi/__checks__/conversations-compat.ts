/**
 * E04-S038 Functional AC2 — typecheck-only proof that the frozen
 * `contracts/openapi/conversations.yaml` produces types that are compatible
 * with the shapes the service that actually implements it returns.
 *
 * REPOINTED (E04-S069, evidence from E04-S064's `generation-compat.ts`
 * repoint): this file used to import five `apps/web/src/lib/*` modules —
 * the FRONTEND's own runtime types, not the seam that implements the route.
 * `conversations.yaml` describes `services/conversation`'s REST routes
 * (`registerConversationRoutes`/`registerMessageRoutes` in
 * `services/conversation/src/routes/*.ts`), and every one of those routes
 * returns a repository row VERBATIM — `conversations.ts` returns
 * `createConversation`/`lookupConversation`/`updateConversation`'s
 * `ConversationRow` (or `listConversations`'s `ConversationListPage`)
 * straight from `return row` / `return result.row`, and `messages.ts` /
 * `message-feedback.ts` do the same with `MessageRow`, with no reshaping in
 * between. Binding here to the repository row is therefore binding to what
 * actually serialises, not a step removed from it (鐵律 #2's "route
 * SERIALIZES, not an internal repository row" caveat does not fire here
 * BECAUSE the two are the same value — see below for the one place in this
 * package where they are NOT, and why that stays unbound).
 *
 * This file is never executed and never bundled. It is a `tsc --noEmit`
 * gate; see ./README.md for the exact commands.
 *
 * `ChangeEvent` (this contract's SSE payload shape,
 * `contracts/events/conversation-change-events.md`) — BOUND as of E04-S072,
 * option (d), user-approved 2026-09-03. Previously listed here as
 * unbindable: `registerChangeEventRoutes`
 * (`services/conversation/src/routes/change-events.ts`) serialises a
 * private, non-exported `toWirePayload()` function's return value, NOT the
 * exported `ChangeEventRow` repository type, which differs from the wire
 * shape in the one field that matters (`seq` on the row vs. `id` on the
 * wire) — binding to `ChangeEventRow` would have produced a spurious
 * mismatch that is not a real contract violation.
 *
 * The user's first authorization (2026-09-02, "precisely one line") asked
 * for `export type ChangeEventWire = ReturnType<typeof toWirePayload>` with
 * `toWirePayload`'s signature left untouched. That line type-checked but
 * was useless: `toWirePayload` carried an explicit `: Record<string,
 * unknown>` return annotation, and `ReturnType<>` resolves the DECLARED
 * type, not the literal actually returned — so `ChangeEventWire` came back
 * as `Record<string, unknown>`, with every field erased. Proven with `tsc`
 * (not inferred from reading): a field-by-field `AssignableTo` in the
 * direction this file uses everywhere else failed to compile
 * (`TS2344: Type 'unknown' does not satisfy the constraint 'number'`), and
 * the only direction that DID compile (`Schemas["ChangeEvent"]` assignable
 * to `ChangeEventWire`) held for ANY shape — a false-green binding that
 * would never turn red no matter how `toWirePayload` broke.
 *
 * The user's second authorization (2026-09-03, `docs/stories/
 * PENDING_DECISIONS.md` top entry) approved option (d) instead: delete the
 * `: Record<string, unknown>` annotation on `toWirePayload` so its return
 * type is INFERRED from the object literal, then add the type-only export
 * on top of the now-real inferred type. Verified with `tsc
 * --emitDeclarationOnly` against a byte-for-byte copy of the function body
 * (not read off the source): the inferred type is exactly `{ id: number;
 * type: <the 5-member literal union>; conversationId: string; occurredAt:
 * string; messageId?: string; originClientId?: string }`. `toWirePayload`
 * has exactly one call site (`change-events.ts`'s SSE writer, which
 * immediately `JSON.stringify`s the result) — narrowing its inferred return
 * type is a strictly NARROWER type than `Record<string, unknown>`, so it
 * cannot break that caller.
 *
 * `changeEventAssignable` below follows the same field-by-field
 * `AssignableTo<implementation, contract>` direction as
 * `generation-compat.ts`'s `answerAssignable`/`citationsElementAssignable`
 * — a single whole-object `AssignableTo<ChangeEventWire,
 * Schemas["ChangeEvent"]>` is exactly the direction that held trivially for
 * the broken `Record<string, unknown>` binding above, so it is not used
 * here for the same reason it was rejected there.
 */
import type { components } from "./generated/conversations";
import type {
  AiModel,
  ConversationListPage,
  ConversationMode,
  ConversationRow,
  KnowledgeScope,
} from "../../../services/conversation/src/repository/conversations.repository";
import type {
  AnswerFeedbackVerdict,
  AnswerState,
  FeedbackReason,
  MessageRow,
} from "../../../services/conversation/src/repository/messages.repository";
import type { ChangeEventWire } from "../../../services/conversation/src/routes/change-events";

type Schemas = components["schemas"];

/**
 * `A` must be assignable to `B`. Instantiating this type with an `A` that
 * is not assignable is a compile error on the constraint itself.
 */
type AssignableTo<A extends B, B> = A extends B ? true : never;

/**
 * Mutual assignability. Resolves to `never` (→ assigning `true` to it is a
 * compile error) unless the two unions are exactly the same set — used for
 * the enums, where a contract that is merely *narrower* than the
 * implementation's union would silently make values the service can already
 * produce unrepresentable.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/* ── Enum sets must match the service's own unions exactly ─────────────── */

export const modeExact: Exact<Schemas["ConversationMode"], ConversationMode> = true;
export const modelExact: Exact<Schemas["AiModel"], AiModel> = true;
export const scopeExact: Exact<Schemas["KnowledgeScope"], KnowledgeScope> = true;
export const answerStateExact: Exact<Schemas["AnswerState"], AnswerState> = true;
export const verdictExact: Exact<Schemas["AnswerFeedbackVerdict"], AnswerFeedbackVerdict> = true;
export const feedbackReasonExact: Exact<Schemas["FeedbackReason"], FeedbackReason> = true;

/* ── Entities must be assignable to what the routes actually return ────── */

export const conversationAssignable: AssignableTo<Schemas["Conversation"], ConversationRow> = true;
export const listPageAssignable: AssignableTo<Schemas["ConversationListPage"], ConversationListPage> =
  true;
export const messageAssignable: AssignableTo<Schemas["Message"], MessageRow> = true;

/**
 * Value-level smoke check: a literal shaped like a contract `Conversation`
 * must be usable everywhere a `ConversationRow` is expected. Catches
 * required/optional drift that the pure type-level checks above would let
 * through in the "contract adds a required field" direction.
 */
const conversationSample: Schemas["Conversation"] = {
  id: "8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77",
  title: "產品保固政策詢問",
  mode: "normal",
  knowledgeScopes: ["company", "qna"],
  model: "standard",
  archived: false,
  lastMessageAt: "2026-08-12T09:15:00.000Z",
  lastMessagePreview: "保固期從出貨日起算 12 個月，涵蓋原廠零件更換。",
  createdAt: "2026-08-12T09:00:00.000Z",
  updatedAt: "2026-08-12T09:15:00.000Z",
};
export const conversationRow: ConversationRow = conversationSample;

const messageSample: Schemas["Message"] = {
  id: "1b6a1f2c-3d4e-4f50-8a61-7c8d9e0f1a2b",
  conversationId: conversationSample.id,
  role: "assistant",
  content: "保固期從出貨日起算 12 個月。[1]",
  attachmentNames: [],
  createdAt: "2026-08-12T09:15:00.000Z",
  state: "ANSWERED",
  feedback: "OK",
  citationFeedback: { "1": "OK" },
};
export const messageRow: MessageRow = messageSample;

/**
 * `ChangeEvent` (E04-S072) — field by field, `AssignableTo<implementation,
 * contract>`, same direction as `generation-compat.ts`'s
 * `answerAssignable`/`citationsElementAssignable`. `type` is checked as
 * `Exact`, not `AssignableTo`, because it is a closed enum on both sides —
 * `type` is the contract's literal union and the wire's inferred literal
 * union must be exactly that set, in both directions (a narrower contract
 * would make an event `toWirePayload` can already emit unrepresentable; a
 * wider one would leave the client with a `type` value it never handles).
 */
export const changeEventIdAssignable: AssignableTo<ChangeEventWire["id"], Schemas["ChangeEvent"]["id"]> =
  true;
export const changeEventTypeExact: Exact<ChangeEventWire["type"], Schemas["ChangeEvent"]["type"]> = true;
export const changeEventConversationIdAssignable: AssignableTo<
  ChangeEventWire["conversationId"],
  Schemas["ChangeEvent"]["conversationId"]
> = true;
export const changeEventOccurredAtAssignable: AssignableTo<
  ChangeEventWire["occurredAt"],
  Schemas["ChangeEvent"]["occurredAt"]
> = true;
export const changeEventMessageIdAssignable: AssignableTo<
  Exclude<ChangeEventWire["messageId"], undefined>,
  Exclude<Schemas["ChangeEvent"]["messageId"], undefined>
> = true;
export const changeEventOriginClientIdAssignable: AssignableTo<
  Exclude<ChangeEventWire["originClientId"], undefined>,
  Exclude<Schemas["ChangeEvent"]["originClientId"], undefined>
> = true;

/**
 * Security AC — no request body may let a client name the owner. Each of
 * these resolves to `never` if a `userId`/`ownerKey`/`ownerId` key ever
 * appears on a request schema, which makes the assignment below fail.
 */
type OwnerFreeKeys<T> = Extract<keyof T, "userId" | "ownerKey" | "ownerId" | "owner">;
type OwnerFree<T> = [OwnerFreeKeys<T>] extends [never] ? true : never;

export const createConversationOwnerFree: OwnerFree<Schemas["CreateConversationRequest"]> = true;
export const updateConversationOwnerFree: OwnerFree<Schemas["UpdateConversationRequest"]> = true;
export const createMessageOwnerFree: OwnerFree<Schemas["CreateMessageRequest"]> = true;
export const createRevisionOwnerFree: OwnerFree<Schemas["CreateRevisionRequest"]> = true;
export const conversationOwnerFree: OwnerFree<Schemas["Conversation"]> = true;
export const messageOwnerFree: OwnerFree<Schemas["Message"]> = true;
export const changeEventOwnerFree: OwnerFree<Schemas["ChangeEvent"]> = true;
