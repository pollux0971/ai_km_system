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
export { createInMemoryVectorStore, VectorStoreError } from "./vector/store.js";
export type { VectorRecord, RetrievalHit, VectorStore } from "./vector/store.js";
export {
  createSqliteVecVectorStore,
  SQLITE_VEC_MIGRATION,
  PartitionOverlapError,
} from "./vector/sqlite-vec.store.js";
export type {
  SqliteStatement,
  SqliteDatabase,
  SqliteVecStoreOptions,
} from "./vector/sqlite-vec.store.js";
