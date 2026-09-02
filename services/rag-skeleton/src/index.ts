// These modules have left this package. Scope moved to services/retrieval
// (E04-S060), chunking to services/ingestion (E06-S022), the vector store
// to services/retrieval (E04-S061), and evidence-tier.ts / embedding/provider.ts
// to services/retrieval (E04-S066); these re-exports keep @ai-km/rag-skeleton's
// public surface unchanged for the remainder of its life. The whole package is
// deleted at E04-S064, and these go with it.
export {
  toRetrievalScope,
  buildScopePredicate,
  buildScopeSql,
  assertNoScopeLeak,
  RetrievalScopeError,
  ScopeLeakError,
} from "@ai-km/service-retrieval";
export type { RetrievalScope, ScopedRecord } from "@ai-km/service-retrieval";
export { chunkDocument, ChunkingError } from "@ai-km/service-ingestion";
export type { Chunk, ChunkOptions } from "@ai-km/service-ingestion";
export {
  PROVIDER_FIDELITY_LEVELS,
  FIDELITY_LIMITS,
  ProviderFidelityError,
  isAtLeast,
  requireProviderFidelity,
  effectiveFidelity,
} from "@ai-km/service-retrieval";
export type { ProviderFidelity, FidelityRatedComponent } from "@ai-km/service-retrieval";
export {
  EmbeddingError,
  assertDimensions,
  dot,
  normalise,
  EMBEDDING_FIDELITY,
} from "@ai-km/service-retrieval";
export type { Embedding, EmbeddingProvider } from "@ai-km/service-retrieval";
export * from "./embedding/model-gateway-deterministic.provider.js";
export * from "./generation/provider.js";
export * from "./generation/model-gateway-canned.provider.js";
export {
  createInMemoryVectorStore,
  VectorStoreError,
  createSqliteVecVectorStore,
  SQLITE_VEC_MIGRATION,
  PartitionOverlapError,
} from "@ai-km/service-retrieval";
export type {
  VectorRecord,
  RetrievalHit,
  VectorStore,
  SqliteStatement,
  SqliteDatabase,
  SqliteVecStoreOptions,
} from "@ai-km/service-retrieval";
export * from "./pipeline.js";
