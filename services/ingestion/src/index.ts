export { ingestionPlugin } from "./plugin.js";
export type { IngestionPluginOptions } from "./plugin.js";
export { createIngestionScaffold, IngestionNotImplementedError } from "./service.js";
export type { IngestionService } from "./service.js";
export { chunkDocument, ChunkingError } from "./chunking/chunk.js";
export type { Chunk, ChunkOptions } from "./chunking/chunk.js";
