/**
 * GenerationProvider — the second and last place a model is required.
 *
 * The canned provider below returns a deterministic answer built from the
 * citations it was handed. That sounds trivial, and the thing it proves is
 * not: that the context passed in is exactly the context cited out. If an
 * unauthorised chunk ever reaches generation, the canned provider will cite
 * it, and the skeleton test will catch it — which is precisely the assertion
 * that a real model makes *harder* to write, because a real model's output is
 * non-deterministic.
 *
 * So the fake is better than the real model for this particular AC. That is
 * the general shape of the argument: pick the tier that can actually prove the
 * claim, not the most realistic one available.
 */

import type { ProviderFidelity, FidelityRatedComponent } from "@ai-km/service-retrieval";
import type { RetrievalHit } from "@ai-km/service-retrieval";

export interface Citation {
  readonly chunkId: string;
  readonly documentId: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface GenerationRequest {
  readonly question: string;
  readonly context: readonly RetrievalHit[];
}

export interface GenerationResult {
  readonly answer: string;
  /** MUST be a subset of the chunkIds supplied in `context`. */
  readonly citations: readonly Citation[];
}

export interface GenerationProvider extends FidelityRatedComponent {
  generate(request: GenerationRequest): Promise<GenerationResult>;
}

export class GenerationError extends Error {
  override readonly name = "GenerationError";
}

/**
 * Contract check applied to EVERY provider, fake or real: a citation naming a
 * chunk that was not in the supplied context is a fabricated source. For the
 * canned provider this is trivially satisfied; for a real model it is one of
 * the highest-value guards in the product.
 */
export function assertCitationsGrounded(
  request: GenerationRequest,
  result: GenerationResult,
): GenerationResult {
  const supplied = new Set(request.context.map((c) => c.chunkId));
  const fabricated = result.citations.filter((c) => !supplied.has(c.chunkId));
  if (fabricated.length > 0) {
    throw new GenerationError(
      `生成結果引用了 ${fabricated.length} 個不在 context 內的 chunk` +
        `(${fabricated.map((c) => c.chunkId).join(", ")})。` +
        `這代表引用是被捏造的,或 context 在傳遞途中被替換——兩者都不得放行。`,
    );
  }
  return result;
}

export const GENERATION_FIDELITY: Readonly<Record<string, ProviderFidelity>> = Object.freeze({
  canned: "PF1",
  http: "PF2",
});

export interface CannedProviderOptions {
  /** Overrides the answer body. Citations are still derived from context. */
  readonly answerTemplate?: (request: GenerationRequest) => string;
}

export function createCannedGenerationProvider(
  options: CannedProviderOptions = {},
): GenerationProvider {
  const provider: GenerationProvider & FidelityRatedComponent = {
    componentId: "generation:canned",
    fidelityCeiling: "PF1",

    async generate(request) {
      const citations: Citation[] = request.context.map((hit) => ({
        chunkId: hit.chunkId,
        documentId: hit.documentId,
        startOffset: hit.startOffset,
        endOffset: hit.endOffset,
      }));

      const answer =
        options.answerTemplate?.(request) ??
        `[canned] 依據 ${citations.length} 段來源回答:${request.question}`;

      return assertCitationsGrounded(request, { answer, citations });
    },
  };

  return provider;
}
