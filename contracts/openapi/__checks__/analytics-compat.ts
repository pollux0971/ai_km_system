/**
 * E13-S018 Functional AC1 — typecheck-only proof that
 * `contracts/openapi/analytics.yaml` produces types compatible with the
 * shapes apps/admin already uses, and that its client-facing input schemas
 * stay fail-closed on server-derived identity.
 *
 * Never executed, never bundled. See ./README.md for the commands.
 */
import type { components } from "./generated/analytics.js";
import type { FeedbackItem as AdminFeedbackItem } from "../../../apps/admin/src/lib/feedback.js";

type Schemas = components["schemas"];

type AssignableTo<A extends B, B> = A extends B ? true : never;
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * Data / Contract AC — the contract's `FeedbackItem` must be usable
 * everywhere apps/admin's existing `FeedbackItem` is, despite carrying
 * additional identifiers (`messageId`, `conversationId`, `answerExcerpt`)
 * apps/admin's client-local shape never needed.
 */
export const feedbackItemAssignable: AssignableTo<Schemas["FeedbackItem"], AdminFeedbackItem> = true;

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
export const feedbackItem: AdminFeedbackItem = feedbackItemSample;

/** A feedback item with only the required fields must still satisfy apps/admin's type. */
const minimalFeedbackItemSample: Schemas["FeedbackItem"] = {
  id: "fb-0002",
  verdict: "ok",
  submittedAt: "2026-08-28T05:15:00.000Z",
  messageId: "1b6a1f2c-3d4e-4f50-8a61-7c8d9e0f1a2b",
  conversationId: "8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77",
  answerExcerpt: "保固期從出貨日起算 12 個月。",
};
export const minimalFeedbackItem: AdminFeedbackItem = minimalFeedbackItemSample;

/**
 * Security AC — `UsageEventInput` must never be able to carry a
 * caller-asserted identity field. Resolves to `never` if `userId` (or any
 * other owner-naming field) appears, same pattern `auth.yaml`'s
 * `LoginRequest` check already establishes.
 */
type OwnerFreeKeys<T> = Extract<keyof T, "userId" | "ownerKey" | "ownerId" | "owner">;
type OwnerFree<T> = [OwnerFreeKeys<T>] extends [never] ? true : never;

export const usageEventInputOwnerFree: OwnerFree<Schemas["UsageEventInput"]> = true;

/**
 * Functional AC — `UsageEventName` must be exactly the E13-S016 whitelist:
 * narrower would make an event apps/web's own mock pipeline already records
 * unrepresentable; wider would let this contract invent a value nothing in
 * the codebase produces.
 */
type UsageEventNameWhitelist = "conversation_message_sent" | "conversation_created" | "rag_answer_outcome";
export const usageEventNameExact: Exact<Schemas["UsageEventName"], UsageEventNameWhitelist> = true;

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

/** Zero-sample latency must be representable as `null`, not forced to `0`. */
const zeroSampleLatencySample: Schemas["LatencyMetrics"] = {
  averageLatencyMs: null,
  sampleCount: 0,
};
export const zeroSampleLatency: Schemas["LatencyMetrics"] = zeroSampleLatencySample;
