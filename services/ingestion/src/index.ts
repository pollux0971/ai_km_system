export { ingestionPlugin } from "./plugin.js";
export type { IngestionPluginOptions } from "./plugin.js";
export {
  createIngestionScaffold,
  createIngestionService,
  IngestionNotImplementedError,
  IngestionScopeError,
  IngestionValidationError,
  IngestionEmptyDocumentError,
} from "./service.js";
export type { IngestionService, IngestionDeps, IngestDocumentInput, IngestDocumentResult } from "./service.js";
export { chunkDocument, ChunkingError } from "./chunking/chunk.js";
export type { Chunk, ChunkOptions } from "./chunking/chunk.js";
export {
  extractPdfText,
  extractorVersion,
  PdfExtractionError,
  PdfEncryptedError,
  PdfEmptyTextError,
} from "./extraction/pdf-extract.js";
export type { PdfExtractionResult } from "./extraction/pdf-extract.js";
export { joinTextItems, expandLigatures, JOIN_RULES_VERSION } from "./extraction/join.js";
export type { JoinableTextItem } from "./extraction/join.js";
