export * from "./evidence-tier.js";
export {
  toRetrievalScope,
  buildScopePredicate,
  buildScopeSql,
  assertNoScopeLeak,
  RetrievalScopeError,
  ScopeLeakError,
} from "@ai-km/service-retrieval";
export type { RetrievalScope, ScopedRecord } from "@ai-km/service-retrieval";
export * from "./chunking/chunk.js";
export * from "./embedding/provider.js";
export * from "./embedding/deterministic.provider.js";
export * from "./generation/provider.js";
export * from "./vector/store.js";
export * from "./vector/sqlite-vec.store.js";
export * from "./pipeline.js";
