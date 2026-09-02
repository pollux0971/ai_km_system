/**
 * The walking skeleton: ingest → chunk → embed → store → scope → retrieve →
 * generate → cite.
 *
 * Every stage here is the real implementation except the two provider seams,
 * which are swappable by tier. That is the whole design: the RAG *feature* is
 * real from day one; only *model inference* is substituted.
 *
 * `effectiveFidelity` is exposed so a caller (or a test, or a CI job summary) can
 * ask what grade of evidence this particular wiring is capable of producing,
 * instead of inferring it from which files happened to be imported.
 */

import { chunkDocument, type ChunkOptions } from "@ai-km/service-ingestion";
import type { GenerationProvider, GenerationResult } from "./generation/provider.js";
import { assertCitationsGrounded } from "./generation/provider.js";
import type { VectorRecord, VectorStore, RetrievalHit } from "@ai-km/service-retrieval";
import { assertNoScopeLeak, type RetrievalScope } from "@ai-km/service-retrieval";
import type { EmbeddingProvider } from "@ai-km/service-retrieval";
import {
  effectiveFidelity,
  requireProviderFidelity,
  type ProviderFidelity,
  type FidelityRatedComponent,
} from "@ai-km/service-retrieval";

export interface SourceDocument {
  readonly documentId: string;
  readonly text: string;
  /** The department/group this document belongs to. Required — no default. */
  readonly scopeKey: string;
}

export interface PipelineOptions {
  readonly embedding: EmbeddingProvider;
  readonly generation: GenerationProvider;
  readonly store: VectorStore;
  readonly chunking?: ChunkOptions;
}

export interface AskResult extends GenerationResult {
  readonly retrieved: readonly RetrievalHit[];
  readonly fidelity: ProviderFidelity;
}

export class RagPipeline {
  private readonly options: PipelineOptions;
  private readonly components: readonly FidelityRatedComponent[];

  constructor(options: PipelineOptions) {
    this.options = options;
    this.components = [options.embedding, options.generation, options.store];
  }

  /** The highest provider fidelity this wiring can honestly produce. */
  get fidelity(): ProviderFidelity {
    return effectiveFidelity(this.components);
  }

  /** Fails loudly if this wiring cannot support the tier an AC claims. */
  requireFidelity(required: ProviderFidelity): void {
    requireProviderFidelity(required, this.components);
  }

  async ingest(documents: readonly SourceDocument[]): Promise<number> {
    const records: VectorRecord[] = [];

    for (const doc of documents) {
      if (typeof doc.scopeKey !== "string" || doc.scopeKey.trim() === "") {
        throw new Error(
          `文件 ${doc.documentId} 缺少 scopeKey。匯入階段就必須帶入範圍,` +
            `否則它的 chunk 會成為無主資料而對所有人可見。`,
        );
      }
      const chunks = chunkDocument(doc.documentId, doc.text, this.options.chunking);
      if (chunks.length === 0) continue;

      const vectors = await this.options.embedding.embed(chunks.map((c) => c.text));
      chunks.forEach((chunk, i) => {
        records.push({
          chunkId: chunk.chunkId,
          documentId: chunk.documentId,
          text: chunk.text,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          scopeKey: doc.scopeKey,
          embedding: vectors[i]!,
        });
      });
    }

    await this.options.store.upsert(records);
    return records.length;
  }

  async ask(question: string, scope: RetrievalScope, topK = 4): Promise<AskResult> {
    const [queryVector] = await this.options.embedding.embed([question]);
    if (!queryVector) throw new Error("embedding provider 未回傳查詢向量。");

    // Scope goes INTO the query — see services/retrieval/src/vector/store.ts.
    const retrieved = await this.options.store.query(queryVector, scope, topK);

    // Re-assert on the pipeline boundary as well as the store boundary. A
    // future store implementation is a new opportunity to leak.
    assertNoScopeLeak(scope, retrieved);

    const request = { question, context: retrieved };
    const result = await this.options.generation.generate(request);

    // The provider is trusted to self-check; the pipeline verifies anyway,
    // because a third-party or real-model provider may not.
    assertCitationsGrounded(request, result);

    return { ...result, retrieved, fidelity: this.fidelity };
  }
}
