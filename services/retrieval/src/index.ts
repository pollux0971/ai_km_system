export { retrievalPlugin } from "./plugin.js";
export type { RetrievalPluginOptions } from "./plugin.js";
export {
  createRetrievalService,
  createModelGatewayEmbeddingProvider,
  RetrievalServiceError,
} from "./service.js";
export type { RetrievalService, RetrievalServiceOptions } from "./service.js";
export {
  toRetrievalScope,
  buildScopePredicate,
  buildScopeSql,
  assertNoScopeLeak,
  RetrievalScopeError,
  ScopeLeakError,
} from "./authorization/scope.js";
export type { RetrievalScope, ScopedRecord } from "./authorization/scope.js";
export {
  PROVIDER_FIDELITY_LEVELS,
  FIDELITY_LIMITS,
  ProviderFidelityError,
  isAtLeast,
  requireProviderFidelity,
  effectiveFidelity,
} from "./evidence-tier.js";
export type { ProviderFidelity, FidelityRatedComponent } from "./evidence-tier.js";
export {
  EmbeddingError,
  assertDimensions,
  dot,
  normalise,
  EMBEDDING_FIDELITY,
} from "./embedding/provider.js";
export type { Embedding, EmbeddingProvider } from "./embedding/provider.js";
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
