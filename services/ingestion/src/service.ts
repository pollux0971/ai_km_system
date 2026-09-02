/**
 * `IngestionService` — the index-time pipeline: parse → chunk → embed → store.
 *
 * `createIngestionScaffold()` below is the E06-S041 placeholder: it ignores
 * whatever is passed to `ingest()` and always throws. `createIngestionService()`
 * (E06-S042) is the real pipeline. Both satisfy the same `IngestionService`
 * interface — `ingest`'s parameter is declared OPTIONAL for exactly this
 * reason, so the scaffold's pre-existing zero-argument call sites
 * (`plugin.test.ts`, frozen by the already-approved E06-S041) keep
 * typechecking unchanged; the real implementation below treats a missing
 * input as a validation error rather than a silent no-op.
 *
 * Embedding goes through the Model Gateway in-process
 * (`createModelGateway().embed()`, ADR 0007 §1), the same seam query-time
 * retrieval uses — NOT a provider directly, NOT over HTTP. That is not
 * tidiness: if index-time and query-time embeddings ever come from different
 * code paths, stored vectors stop being comparable to query vectors and
 * retrieval degrades silently, and E12-S032's vector-dimension guard (in
 * `gateway.ts`) only protects callers that actually go through it.
 *
 * PERSISTENCE GAP (explicit, not silently dropped): `extractorVersion` (from
 * `extractPdfText`, E06-S008) and the embedding model identifier (from the
 * Model Gateway's `EmbedResponse.model`) are both returned by `ingest()` in
 * `IngestDocumentResult`, but `VectorRecord` (`@ai-km/service-retrieval`,
 * E04-S061) has NO column to persist either one alongside the stored chunks.
 * This pipeline does not invent one — `services/retrieval` is out of scope
 * for this story, and adding fields there without review would be inventing
 * schema. Landing those columns (and rejecting retrieval when a query
 * embedding's version disagrees with what is stored) is E06-S026's job; until
 * that story lands, a caller that wants this metadata must capture it from
 * `ingest()`'s return value at call time — it does not survive a restart or a
 * later query.
 */
import { extractPdfText } from "./extraction/pdf-extract.js";
import { chunkDocument } from "./chunking/chunk.js";

// Deep imports rather than the package barrel (`@ai-km/service-model-gateway`),
// same reasoning as `services/rag-skeleton/src/embedding/
// model-gateway-deterministic.provider.ts`: that barrel's `index.ts`
// re-exports `modelGatewayPlugin`, which pulls in the ASR route module
// (`routes/transcriptions.ts`) transitively, and THIS package's tsconfig also
// turns on `exactOptionalPropertyTypes` (model-gateway's own tsconfig does
// not), surfacing a pre-existing, unrelated type error in that ASR code once
// it is part of the same compilation unit (tracked separately as E12-S034,
// being fixed in parallel — not this story's job). `gateway.ts` itself only
// imports the embedding/generation provider modules — never the ASR route —
// so importing it directly avoids dragging in code this pipeline has nothing
// to do with.
import type { EmbedRequest, ModelGateway } from "@ai-km/service-model-gateway/src/gateway.js";

// `@ai-km/service-retrieval`'s barrel does NOT have the ASR-route problem
// above (it never imports model-gateway), and its own tsconfig already has
// `exactOptionalPropertyTypes` on, so importing it here introduces nothing
// new — a plain barrel import is the right pattern for this one.
import type { VectorRecord, VectorStore } from "@ai-km/service-retrieval";

export class IngestionNotImplementedError extends Error {
  override readonly name = "IngestionNotImplementedError";
}

/**
 * A document was submitted without a usable `scopeKey`. Refused at the top of
 * `ingest()`, before extraction/chunking/embedding run: a chunk written
 * without a scope would be visible to every principal (`VectorStore.upsert`
 * would refuse it too, but failing here is cheaper and the message is
 * specific to ingestion rather than the store's generic one).
 */
export class IngestionScopeError extends Error {
  override readonly name = "IngestionScopeError";
}

/** `ingest()` was called with no input, or input missing a required field other than scope. */
export class IngestionValidationError extends Error {
  override readonly name = "IngestionValidationError";
}

/**
 * Chunking produced zero chunks even though extraction produced non-empty
 * text (e.g. the extracted text is whitespace-only — `extractPdfText` only
 * refuses an exactly-empty string, `chunkDocument` separately drops
 * whitespace-only slices). Refused explicitly for the same reason the
 * scaffold refused unconditionally: a pipeline that quietly stores nothing
 * must not report success.
 */
export class IngestionEmptyDocumentError extends Error {
  override readonly name = "IngestionEmptyDocumentError";
}

/**
 * E06-S026 — the Model Gateway's `EmbedResponse` did not report a usable
 * `model` identifier or a valid positive `dimensions`. Refused BEFORE any
 * `VectorRecord` is built or `vectorStore.upsert()` is called — this is the
 * "寫入路徑(索引管線)" Functional AC2 refers to: a chunk written without a
 * recorded embedding identity can never be safely compared against a future
 * query, and the fix is not to invent a default (that is exactly the
 * "大概是現在這個 provider" guess the spec's Anti-hallucination Guard
 * forbids) — it is to refuse the write and surface a loud, diagnosable
 * error. In practice this never fires against the real deterministic
 * provider (`services/model-gateway`), which always reports both; it exists
 * to catch a future provider (or a misconfigured gateway) that doesn't.
 */
export class IngestionEmbeddingIdentityError extends Error {
  override readonly name = "IngestionEmbeddingIdentityError";
}

export interface IngestDocumentInput {
  readonly documentId: string;
  /** Department/group key every resulting chunk is written with. Required — see `IngestionScopeError`. */
  readonly scopeKey: string;
  readonly pdfBytes: Uint8Array;
  /** Correlation id threaded to the Model Gateway call, for log correlation. Defaults to `ingest:<documentId>`. */
  readonly correlationId?: string;
}

export interface IngestDocumentResult {
  readonly documentId: string;
  readonly scopeKey: string;
  readonly chunkCount: number;
  readonly pageCount: number;
  /** `pdfjs-dist@<version>+join-rules@<version>` — see `extraction/pdf-extract.ts`. Not persisted; see module doc. */
  readonly extractorVersion: string;
  /** The Model Gateway's `EmbedResponse.model`. Not persisted; see module doc. */
  readonly embeddingModel: string;
}

export interface IngestionService {
  readonly componentId: string;
  /**
   * Runs parse → chunk → embed → store for one PDF.
   *
   * `input` is optional only so the E06-S041 scaffold (which takes no useful
   * input at all) keeps satisfying this interface without touching that
   * story's frozen tests; the real implementation
   * (`createIngestionService`) treats a missing `input` as
   * `IngestionValidationError`, not as a no-op.
   *
   * Throws rather than reporting "0 chunks indexed": a scanned or image-only
   * PDF extracts to an empty string (`PdfEmptyTextError`, E06-S008), and a
   * whitespace-only extraction can still chunk to zero pieces
   * (`IngestionEmptyDocumentError`, this story). Either way, a pipeline that
   * quietly stores nothing leaves the user staring at "no matching documents"
   * for a document they just uploaded successfully.
   */
  ingest(input?: IngestDocumentInput): Promise<IngestDocumentResult>;
}

export function createIngestionScaffold(): IngestionService {
  return {
    componentId: "ingestion:scaffold",
    async ingest(): Promise<never> {
      throw new IngestionNotImplementedError(
        "services/ingestion 尚未實作。這是 E06-S041 建立的空殼,實作由 E06-S022(chunking 搬移)、" +
          "E06-S008(PDF 文字抽取,保留字元偏移量)、E06-S042(索引管線)補上。" +
          "此處刻意拋錯而非回報「索引了 0 個 chunk」——掃描檔或純圖片 PDF 抽出來是空字串," +
          "安靜存 0 個 chunk 會讓使用者對著一份剛上傳成功的文件看到「查無資料」。",
      );
    },
  };
}

export interface IngestionDeps {
  /** The in-process Model Gateway (ADR 0007 §1) — `createModelGateway()`'s return value, already wired with real or fake providers. */
  readonly modelGateway: ModelGateway;
  readonly vectorStore: VectorStore;
}

/**
 * The real pipeline (E06-S042): parse (`extractPdfText`) → chunk
 * (`chunkDocument`) → embed (`deps.modelGateway.embed()`) → store
 * (`deps.vectorStore.upsert()`).
 */
export function createIngestionService(deps: IngestionDeps): IngestionService {
  return {
    componentId: "ingestion:pipeline",

    async ingest(input?: IngestDocumentInput): Promise<IngestDocumentResult> {
      if (!input) {
        throw new IngestionValidationError(
          "ingest() 需要文件輸入(documentId / scopeKey / pdfBytes),不得省略。",
        );
      }
      if (typeof input.scopeKey !== "string" || input.scopeKey.trim() === "") {
        throw new IngestionScopeError(
          "scopeKey 不得為空——沒有範圍的 chunk 無法被授權過濾,寫入前就必須擋下," +
            "否則它會對所有人可見(見 VectorStore.upsert 的同一守門,這裡先擋下以避免白跑抽取/切塊/嵌入)。",
        );
      }

      // parse — offsets computed below are anchored to exactly this string.
      const extraction = await extractPdfText(input.pdfBytes);

      // chunk — offsets point into `extraction.text`.
      const chunks = chunkDocument(input.documentId, extraction.text);
      if (chunks.length === 0) {
        throw new IngestionEmptyDocumentError(
          "切塊結果為 0 個 chunk(抽取文字非空,但整份都是空白字元)。" +
            "拒絕靜默視為「索引了 0 個 chunk」。",
        );
      }

      // embed — through the Model Gateway in-process (ADR 0007 §1), never a provider directly.
      const correlationId = input.correlationId ?? `ingest:${input.documentId}`;
      const embedRequest: EmbedRequest = { input: chunks.map((chunk) => chunk.text) };
      const embedResponse = await deps.modelGateway.embed(embedRequest, correlationId);

      // E06-S026 Functional AC2 — fail closed BEFORE building a single
      // `VectorRecord` or touching the store: a chunk written without a
      // recorded embedding identity can never be compared against a future
      // query, and defaulting to e.g. "unknown" would be exactly the
      // "大概是現在這個 provider" guess the spec's Anti-hallucination Guard
      // forbids.
      if (typeof embedResponse.model !== "string" || embedResponse.model.trim() === "") {
        throw new IngestionEmbeddingIdentityError(
          "Model Gateway 未回報有效的 embedding model 身分,拒絕寫入——沒有身分的向量無法在查詢時" +
            "被比對,也不能用預設值補齊(那等於猜測,可能與實際模型不符)。",
        );
      }
      if (!Number.isInteger(embedResponse.dimensions) || embedResponse.dimensions <= 0) {
        throw new IngestionEmbeddingIdentityError(
          `Model Gateway 回報的 embedding dimensions(${embedResponse.dimensions})不是正整數,` +
            "拒絕寫入,理由同 embedding model 缺失的情況。",
        );
      }

      // The gateway already guarantees `data.length === input.length` and
      // index-ordering (see `gateway.ts`'s own check) — this loop trusts that
      // contract rather than re-deriving it, and only guards against
      // `noUncheckedIndexedAccess`.
      const records: VectorRecord[] = chunks.map((chunk, index) => {
        const datum = embedResponse.data[index];
        if (!datum) {
          throw new IngestionValidationError(
            `Model Gateway 回傳的嵌入向量數量與 chunk 數量不符(缺少 index ${index})。`,
          );
        }
        return {
          chunkId: chunk.chunkId,
          documentId: chunk.documentId,
          text: chunk.text,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          scopeKey: input.scopeKey,
          embedding: Float32Array.from(datum.embedding),
          // E06-S026 — validated non-empty/positive immediately above.
          embeddingModel: embedResponse.model,
          embeddingDimensions: embedResponse.dimensions,
        };
      });

      // store
      await deps.vectorStore.upsert(records);

      return {
        documentId: input.documentId,
        scopeKey: input.scopeKey,
        chunkCount: chunks.length,
        pageCount: extraction.pageCount,
        extractorVersion: extraction.extractorVersion,
        embeddingModel: embedResponse.model,
      };
    },
  };
}
