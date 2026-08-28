export { conversationPlugin } from "./plugin.js";
export {
  appendChangeEvent,
  listChangeEventsAfter,
  CHANGE_EVENT_TYPES,
  MAX_CHANGE_EVENT_PAGE,
  type ChangeEventInput,
  type ChangeEventRow,
  type ChangeEventType,
} from "./repository/change-events.repository.js";
export {
  prepareOwnerScoped,
  toOwnerKey,
  OwnerScopeError,
  type OwnerKey,
} from "./repository/owner-scope.js";
export {
  createConversation,
  deleteConversation,
  listConversations,
  lookupConversation,
  updateConversation,
  DEFAULT_CONVERSATION_MODEL,
  DEFAULT_CONVERSATION_PREVIEW,
  DEFAULT_CONVERSATION_TITLE,
  type AiModel,
  type ConversationLookupResult,
  type ConversationListPage,
  type ConversationMode,
  type ConversationRow,
  type CreateConversationInput,
  type KnowledgeScope,
  type ListConversationsOptions,
  type UpdateConversationPatch,
} from "./repository/conversations.repository.js";
export { ConversationDomainError } from "./domain-error.js";
export {
  seedSampleConversations,
  conversationSandboxSeeders,
  type SampleConversationSeed,
  type SandboxSeeder,
} from "./seed/sample-conversations.js";
export { seedSampleMessages, messageSandboxSeeders } from "./seed/sample-messages.js";
export { AI_KM_SEED_NAMESPACE, uuidV5 } from "./seed/uuid-v5.js";
export {
  createMessage,
  createRevision,
  getMessage,
  getMessageByOwner,
  listMessages,
  touchConversationSummary,
  type AnswerFeedbackVerdict,
  type AnswerState,
  type CreateMessageInput,
  type FeedbackReason,
  type MessageRole,
  type MessageRow,
} from "./repository/messages.repository.js";
export {
  extractCitationIds,
  setCitationFeedback,
  setFeedbackComment,
  setFeedbackReason,
  setFeedbackVerdict,
} from "./repository/message-feedback.repository.js";
export {
  adminGetMessage,
  adminListMessagesWithFeedback,
  type AdminFeedbackCitationVerdict,
  type AdminFeedbackItem,
  type AdminFeedbackPage,
  type AdminFeedbackVerdict,
  type AdminListFeedbackOptions,
} from "./repository/admin-read.repository.js";
