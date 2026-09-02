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
import type { EmbeddingProvider } from "./embedding/provider.js";
import type { GenerationProvider, GenerationResult } from "./generation/provider.js";
// The ONE `assertCitationsGrounded` (E12-S033 consolidation) — see
// `@ai-km/service-model-gateway`'s `generation/provider.ts` for why this
// package no longer carries its own copy. Deep import for the same reason
// `./embedding/model-gateway-deterministic.provider.ts` uses one: the
// package barrel drags in ASR route code that trips a pre-existing,
// unrelated `exactOptionalPropertyTypes` error (E12-S034), and `gateway.ts`'s
// own import graph never touches that code.
import { assertCitationsGrounded } from "@ai-km/service-model-gateway/src/generation/provider.js";
import type { VectorRecord, VectorStore, RetrievalHit } from "./vector/store.js";
import { assertNoScopeLeak, type RetrievalScope } from "@ai-km/service-retrieval";
import {
  effectiveFidelity,
  requireProviderFidelity,
  type ProviderFidelity,
  type FidelityRatedComponent,
} from "./evidence-tier.js";

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

    // Scope goes INTO the query — see vector/store.ts.
    const retrieved = await this.options.store.query(queryVector, scope, topK);

    // Re-assert on the pipeline boundary as well as the store boundary. A
    // future store implementation is a new opportunity to leak.
    assertNoScopeLeak(scope, retrieved);

    if (retrieved.length === 0) {
      // Deny-Wins (AC3b) and a genuinely empty store both land here with
      // nothing authorised to answer from. Do NOT call the generation seam
      // with an empty context: since E12-S033 routes this call through
      // `createModelGateway().generate()`, an empty context now hits
      // `GenerationNoContextError` there (the gateway's "never answer from
      // parametric knowledge" rule for a real inference call) — the right
      // policy for that seam, but the wrong shape for `ask()`, which AC3b
      // requires to return gracefully with zero citations rather than throw.
      // Short-circuiting is not skipping a check: an empty citation list is
      // trivially grounded (⊆ ∅), so there is nothing for
      // `assertCitationsGrounded` below to verify in this branch.
      return {
        answer: `沒有可引用的來源,無法回答:${question}`,
        citations: [],
        retrieved,
        fidelity: this.fidelity,
      };
    }

    const request = { question, context: retrieved };
    const result = await this.options.generation.generate(request);

    // Independent re-check at the pipeline boundary, using the Model
    // Gateway's single consolidated implementation (E12-S033). Still
    // meaningful even when `options.generation` routes through
    // `createModelGateway().generate()` internally (which already grounds):
    // `options.generation` is an injectable seam, and a caller can plug in a
    // provider that talks directly to THIS interface without ever going
    // through the gateway — exactly what the walking-skeleton test's rogue
    // provider does to prove this line fires. When the provider *is*
    // gateway-routed, this call is a coherent, idempotent re-check, not two
    // independent unproven implementations drifting apart.
    assertCitationsGrounded(retrieved, result.citations);

    return { ...result, retrieved, fidelity: this.fidelity };
  }
}
