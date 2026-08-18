import type { ApiError, Result } from "@ai-km/types";
import type { FeedbackReason, Message } from "./messages";

/**
 * E13-S015 "feedback-to-knowledge-candidate flow". Turns an NG-feedback
 * message that already has a reason + comment (E13-S002/S003/S004) into
 * a "knowledge candidate" a knowledge-base maintainer could review — the
 * epic file gives this story nothing beyond its title (confirmed by
 * grep), so the shape below is a Team-A ASSUMPTION, not a spec fact.
 *
 * IMPORTANT — this is a DIFFERENT entity from `knowledge-candidates.ts`'s
 * own `KnowledgeCandidate` (E07-S023 "Knowledge candidate submission"),
 * which already exists in this codebase and was discovered mid-
 * implementation (an earlier draft of this file briefly clobbered it
 * before this was caught and reverted — see git history). That entity is
 * a maintenance-case content submission (`maintenanceCaseId` + free-text
 * `content`), explicitly designed to pair with E08-S20 "Knowledge
 * Candidate" (Team B, Maintenance Intelligence Backend) — a completely
 * different domain, lifecycle, and source (a technician submitting case
 * write-ups) from this story's source (a conversation answer's NG
 * feedback). Reusing E07-S023's type/file would conflate two unrelated
 * "candidate" concepts under one name and one storage key purely because
 * they share an English word — this file is deliberately named/typed
 * distinctly (`FeedbackKnowledgeCandidate`, its own STORAGE_KEY) instead.
 *
 * Cross-domain boundary check (the load-bearing decision for this
 * story): grepped both `E05_Knowledge_Management_Experience.md` (Team
 * A's own knowledge-base epic, 31 stories) and
 * `E06_Knowledge_Ingestion_&_Indexing.md` (Team B's ingestion/indexing
 * epic, 40 stories) for "candidate"/"候選"/"feedback" — zero hits in
 * either for THIS (conversation-feedback) flow (E07-S023/E08-S20's
 * "candidate" is a distinct, unrelated pairing, per the note above).
 * Actually WRITING a candidate into the knowledge base — creating a
 * real, searchable `KnowledgeBaseDocument` that RAG retrieval could
 * surface — is unambiguously E06's ingestion pipeline
 * (parsing/chunking/embedding/indexing, none of which exist in this
 * codebase, all Team B's domain per ATOMIC_STORY_BOUNDARIES.md's Domain
 * Ownership Boundary). This module does NOT attempt that: no function
 * here touches this codebase's knowledge-base document store, and
 * nothing here is presented as a real E06 (or E08) contract.
 *
 * What Team A genuinely owns and CAN honestly deliver: the "flow" this
 * story's own title asks for — an NG-feedback message, once a
 * maintainer-useful reason+comment pair already exists on it
 * (E13-S002/S003/S004), can be explicitly flagged by the end user as
 * "this answer reveals a real knowledge gap, please review it," and
 * that flag is durably recorded and independently queryable — the same
 * "record a fact this app genuinely owns, mirror event/messages.ts
 * patterns, don't fabricate what it doesn't own" shape as
 * usage-events.ts (E13-S009-S013). A candidate here never becoming a
 * real KB document is the same honestly-disclosed limitation
 * E11-S016/E13-S007/E13-S008 already established for the reverse
 * direction (apps/admin can't read apps/web's feedback either) — this
 * is Team A's half of a flow whose other half (ingestion) is
 * BLOCKED_DEPENDENCY on Team B, not silently invented.
 *
 * Kept as its own file/collection (own STORAGE_KEY), not folded into
 * messages.ts — same "Message is its own file, own collection keyed by
 * conversationId" precedent messages.ts's own top-of-file doc comment
 * already gives for why Message lives apart from ConversationSummary; a
 * FeedbackKnowledgeCandidate is conceptually a derived, separately-
 * reviewable artifact, not a field growing Message's own shape further.
 */
export interface FeedbackKnowledgeCandidate {
  id: string;
  sourceMessageId: string;
  conversationId: string;
  answerContent: string;
  reason: FeedbackReason;
  comment: string;
  createdAt: string;
}

const STORAGE_KEY = "ai-km:mock-feedback-knowledge-candidates";

/** Same sessionStorage-backed reasoning as messages.ts's readStore/writeStore. */
function readStore(): FeedbackKnowledgeCandidate[] {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as FeedbackKnowledgeCandidate[];
  } catch {
    return [];
  }
}

function writeStore(items: FeedbackKnowledgeCandidate[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/** All flagged feedback-knowledge candidates, oldest first. Read-only accessor for future review UI. */
export function listFeedbackKnowledgeCandidates(): FeedbackKnowledgeCandidate[] {
  return readStore();
}

/**
 * Flags `message` as a feedback-knowledge candidate. Fails closed with
 * VALIDATION_ERROR (Functional AC 2/3) unless the message already has
 * the full NG + reason + comment triad — this function does its own
 * independent check on the message object it's given rather than
 * trusting the caller, the same "defense in depth, don't assume the UI
 * already enforced it" reasoning submitAnswerFeedback/
 * submitCitationFeedback apply to their own `role !== "assistant"`
 * guards — this is Team A's own additional schema validation, not a
 * re-check of messages.ts's store (this module has no store-lookup
 * precedent to messages.ts's collection — same "own collection, no
 * cross-reach" boundary messages.ts itself keeps from conversations.ts,
 * see that file's own deleteMessagesForConversation doc comment).
 *
 * Idempotent by sourceMessageId — calling this twice for the same
 * message returns the SAME existing candidate rather than creating a
 * duplicate (Functional AC 5: "重複請求...不得造成未定義重複 side effect"),
 * mirroring the "no accidental duplicate side effect on retry" reasoning
 * throughout this codebase's other submit* functions, but stricter:
 * those allow verdict-switching (a deliberate re-submission with new
 * data); a feedback-knowledge candidate has no "different" version to
 * switch to, so true dedup (not just idempotent overwrite) is the
 * correct shape here.
 */
export async function submitFeedbackKnowledgeCandidate(message: Message): Promise<Result<FeedbackKnowledgeCandidate, ApiError>> {
  if (message.feedback !== "NG") {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "只能為「沒有幫助」的回饋標記為知識落差候選。" } };
  }
  if (message.feedbackReason == null) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請先選擇回饋原因。" } };
  }
  if (message.feedbackComment == null || message.feedbackComment.trim().length === 0) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請先填寫留言說明。" } };
  }

  const existing = readStore();
  const already = existing.find((candidate) => candidate.sourceMessageId === message.id);
  if (already) {
    return { ok: true, value: already };
  }

  const candidate: FeedbackKnowledgeCandidate = {
    id: crypto.randomUUID(),
    sourceMessageId: message.id,
    conversationId: message.conversationId,
    answerContent: message.content,
    reason: message.feedbackReason,
    comment: message.feedbackComment,
    createdAt: new Date().toISOString(),
  };
  writeStore([...existing, candidate]);

  return { ok: true, value: candidate };
}
