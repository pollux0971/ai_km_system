/**
 * E04-S038 Functional AC2 — typecheck-only proof that the frozen
 * `contracts/openapi/conversations.yaml` produces types that are compatible
 * with the shapes apps/web has been using since E03-S001.
 *
 * This file is never executed and never bundled. It is a `tsc --noEmit`
 * gate; see ./README.md for the exact commands.
 *
 * It deliberately imports the REAL frontend types (not a hand-copied
 * mirror) — the whole point of the check is that the contract cannot drift
 * away from `apps/web/src/lib/{conversations,messages}.ts` without this
 * file going red.
 */
import type { components } from "./generated/conversations";
import type {
  ConversationListPage,
  ConversationMode,
  ConversationSummary,
} from "../../../apps/web/src/lib/conversations";
import type {
  AnswerFeedbackVerdict,
  FeedbackReason,
  Message,
} from "../../../apps/web/src/lib/messages";
import type { AnswerState } from "../../../apps/web/src/lib/answer-state";
import type { KnowledgeScope } from "../../../apps/web/src/lib/knowledge-scopes";
import type { AiModel } from "../../../apps/web/src/lib/ai-models";

type Schemas = components["schemas"];

/**
 * `A` must be assignable to `B`. Instantiating this type with an `A` that
 * is not assignable is a compile error on the constraint itself.
 */
type AssignableTo<A extends B, B> = A extends B ? true : never;

/**
 * Mutual assignability. Resolves to `never` (→ assigning `true` to it is a
 * compile error) unless the two unions are exactly the same set — used for
 * the enums, where a contract that is merely *narrower* than the frontend
 * union would silently make values the UI can already produce
 * unrepresentable.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/* ── Enum sets must match the frontend unions exactly ─────────────────── */

export const modeExact: Exact<Schemas["ConversationMode"], ConversationMode> = true;
export const modelExact: Exact<Schemas["AiModel"], AiModel> = true;
export const scopeExact: Exact<Schemas["KnowledgeScope"], KnowledgeScope> = true;
export const answerStateExact: Exact<Schemas["AnswerState"], AnswerState> = true;
export const verdictExact: Exact<Schemas["AnswerFeedbackVerdict"], AnswerFeedbackVerdict> = true;
export const feedbackReasonExact: Exact<Schemas["FeedbackReason"], FeedbackReason> = true;

/* ── Entities must be assignable to the shapes apps/web already reads ──── */

export const conversationAssignable: AssignableTo<Schemas["Conversation"], ConversationSummary> = true;
export const listPageAssignable: AssignableTo<Schemas["ConversationListPage"], ConversationListPage> = true;
export const messageAssignable: AssignableTo<Schemas["Message"], Message> = true;

/**
 * Value-level smoke check: a literal shaped like a contract `Conversation`
 * must be usable everywhere a `ConversationSummary` is expected. Catches
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
export const conversationSummary: ConversationSummary = conversationSample;

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
export const message: Message = messageSample;

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
