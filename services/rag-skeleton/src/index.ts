export * from "./evidence-tier.js";
// Both modules have left this package. Scope moved to services/retrieval
// (E04-S060) and chunking to services/ingestion (E06-S022); these re-exports
// keep @ai-km/rag-skeleton's public surface unchanged for the remainder of its
// life. The whole package is deleted at E04-S064, and these go with it.
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
export * from "./embedding/provider.js";
export * from "./embedding/model-gateway-deterministic.provider.js";
export * from "./generation/provider.js";
export * from "./generation/model-gateway-canned.provider.js";
export * from "./vector/store.js";
export * from "./vector/sqlite-vec.store.js";
export * from "./pipeline.js";
