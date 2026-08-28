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
  type SandboxSeeder,
} from "./seed/sample-conversations.js";
export { AI_KM_SEED_NAMESPACE, uuidV5 } from "./seed/uuid-v5.js";
