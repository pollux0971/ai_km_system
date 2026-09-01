/**
 * `GenerationProvider` — the Model Gateway's answer-generation seam.
 *
 * Same shape and same reasoning as `../embedding/provider.ts`; see that file
 * for why no real provider ships yet (E04-S037 has not chosen a runtime).
 */
import type { ProviderFidelity } from "../fidelity.js";

export type GenerationProviderName = "fake";

export interface ContextChunk {
  readonly chunkId: string;
  readonly documentId: string;
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly score?: number;
}

export interface Citation {
  readonly chunkId: string;
  readonly documentId: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface GenerateInput {
  readonly question: string;
  readonly context: readonly ContextChunk[];
  readonly model?: string;
  readonly timeoutMs: number;
  readonly correlationId: string;
}

export interface GenerateResult {
  readonly answer: string;
  readonly citations: readonly Citation[];
  readonly model: string;
}

export interface GenerationProvider {
  readonly name: GenerationProviderName;
  readonly model: string;
  readonly fidelityCeiling: ProviderFidelity;
  generate(input: GenerateInput): Promise<GenerateResult>;
}

/** See `EmbeddingUnavailableError` for why timeouts fold in here for now. */
export class GenerationUnavailableError extends Error {
  override readonly name = "GenerationUnavailableError";
}

/**
 * A citation naming a chunk that was not supplied is a fabricated source.
 *
 * Enforced in the gateway rather than trusted to the provider, because the
 * whole reason baseline §5 rule 28 routes model calls through a gateway is
 * that the provider is the untrusted party. The client rejects the WHOLE
 * response rather than dropping the bad citation: a model that fabricates one
 * source has shown it will fabricate others, and a silently-filtered response
 * looks correct.
 *
 * `services/rag-skeleton/src/generation/provider.ts` has the same rule, tested.
 * g5 consolidates the two into one implementation.
 */
export class FabricatedCitationError extends Error {
  override readonly name = "FabricatedCitationError";
}

export function assertCitationsGrounded(
  context: readonly ContextChunk[],
  citations: readonly Citation[],
): readonly Citation[] {
  const supplied = new Set(context.map((c) => c.chunkId));
  const fabricated = citations.filter((c) => !supplied.has(c.chunkId));
  if (fabricated.length > 0) {
    throw new FabricatedCitationError(
      `生成結果引用了 ${fabricated.length} 個不在 context 內的 chunk` +
        `(${fabricated.map((c) => c.chunkId).join(", ")})。` +
        `這代表引用是被捏造的,或 context 在傳遞途中被替換——兩者都不得放行。`,
    );
  }
  return citations;
}

/**
 * Placeholder fake. **Wiring only.** Echoes the supplied context back as
 * citations, so it is trivially grounded and proves nothing about answer
 * quality. The tested canned provider in
 * `services/rag-skeleton/src/generation/provider.ts` moves here under **g5**.
 */
export class FakeGenerationProvider implements GenerationProvider {
  readonly name = "fake" as const;
  readonly model = "fake-placeholder";
  readonly fidelityCeiling: ProviderFidelity = "PF1";

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const citations: Citation[] = input.context.map((c) => ({
      chunkId: c.chunkId,
      documentId: c.documentId,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
    }));
    return {
      answer: `[fake] 依據 ${citations.length} 段來源回答:${input.question}`,
      citations,
      model: this.model,
    };
  }
}
