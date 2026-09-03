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
export {
  createInMemoryVectorStore,
  VectorStoreError,
  DocumentScopeConflictError,
  DOCUMENT_SCOPE_CONFLICT_MESSAGE,
  EmbeddingVersionMismatchError,
  assertEmbeddingIdentityMatches,
} from "./vector/store.js";
export type { VectorRecord, RetrievalHit, VectorStore, EmbeddingIdentity } from "./vector/store.js";
export {
  createSqliteVecVectorStore,
  SQLITE_VEC_MIGRATION,
  migrateEmbeddingIdentityColumns,
  PartitionOverlapError,
} from "./vector/sqlite-vec.store.js";
export type {
  SqliteStatement,
  SqliteDatabase,
  SqliteVecStoreOptions,
} from "./vector/sqlite-vec.store.js";
export {
  rerankMmr,
  candidatePoolSize,
  DEFAULT_MMR_LAMBDA,
  DEFAULT_CANDIDATE_POOL_MULTIPLIER,
  MIN_CANDIDATE_POOL_OVERFETCH,
  RerankError,
} from "./rerank/mmr.js";
export type { RerankOptions } from "./rerank/mmr.js";
export { retrieveWithReranking } from "./rerank/retrieve-with-reranking.js";
export type { RetrieveWithRerankingOptions } from "./rerank/retrieve-with-reranking.js";
export { CrossEncoderError, sigmoid, CROSS_ENCODER_FIDELITY } from "./rerank/cross-encoder.js";
export type { CrossEncoderProvider, CrossEncoderScore } from "./rerank/cross-encoder.js";
export {
  HttpCrossEncoderProvider,
  CrossEncoderUnavailableError,
  CrossEncoderTimeoutError,
} from "./rerank/cross-encoder-http.provider.js";
export type {
  HttpCrossEncoderProviderOptions,
  CrossEncoderTruncationInfo,
} from "./rerank/cross-encoder-http.provider.js";
