export { retrievalPlugin } from "./plugin.js";
export type { RetrievalPluginOptions } from "./plugin.js";
export { createRetrievalScaffold, RetrievalNotImplementedError } from "./service.js";
export type { RetrievalService } from "./service.js";
export {
  toRetrievalScope,
  buildScopePredicate,
  buildScopeSql,
  assertNoScopeLeak,
  RetrievalScopeError,
  ScopeLeakError,
} from "./authorization/scope.js";
export type { RetrievalScope, ScopedRecord } from "./authorization/scope.js";
