/**
 * CannedGenerationProvider — ceiling PF1.
 *
 * Relocated here from `services/rag-skeleton/src/generation/provider.ts`
 * (E12-S033 — the move `./provider.ts`'s old `FakeGenerationProvider`
 * docstring said belonged "here under g5"), replacing that placeholder.
 * The answer-construction and citation-derivation arithmetic below is
 * UNCHANGED; only the outer shape changed, to read this package's
 * `GenerateInput` (`context: readonly ContextChunk[]`) and return this
 * package's `GenerateResult` (`{answer, citations, model}`) instead of the
 * skeleton's `GenerationRequest`/`GenerationResult` pair.
 * `services/rag-skeleton` now gets this provider through
 * `createModelGateway().generate()` instead of importing it directly — see
 * `../../../rag-skeleton/src/generation/model-gateway-canned.provider.ts`.
 *
 * WHAT IT PROVES: the answer is built ONLY from the citations it was handed,
 * and the citations are ONLY the chunkIds supplied in `context`. That is not
 * a triviality — it is the assertion that a real model makes *harder* to
 * write, because a real model's output is non-deterministic. The fake is
 * better than the real model for this particular claim.
 *
 * NOT SELF-CHECKED (E12-S033 change from the pre-move rag-skeleton version):
 * the old `createCannedGenerationProvider` called `assertCitationsGrounded`
 * on its own output before returning. That call is dropped here on purpose,
 * not lost by accident: `assertCitationsGrounded`'s own docstring says the
 * check belongs to the GATEWAY precisely because "the provider is the
 * untrusted party" (baseline §5 rule 28). `createModelGateway().generate()`
 * already calls it on every provider's result, canned or not, right after
 * this function returns — see `../gateway.ts`. A provider that also
 * self-checks would just be calling the same, now-single, implementation
 * twice on the same data for no additional coverage: this provider's
 * citations are grounded by construction (`citations` is a map over
 * `context`), so the self-check could only ever pass here. Removing it is
 * not a citation-derivation behaviour change — the citations it returns are
 * byte-for-byte the same ones the old self-check would have approved.
 */
import type { Citation, GenerateInput, GenerateResult, GenerationProvider } from "./provider.js";

export interface CannedProviderOptions {
  /** Overrides the answer body. Citations are still derived from context. */
  readonly answerTemplate?: (input: GenerateInput) => string;
}

const MODEL = "generation:canned";

export function createCannedGenerationProvider(
  options: CannedProviderOptions = {},
): GenerationProvider {
  return {
    name: "fake",
    model: MODEL,
    fidelityCeiling: "PF1",

    async generate(input: GenerateInput): Promise<GenerateResult> {
      const citations: Citation[] = input.context.map((chunk) => ({
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
      }));

      const answer =
        options.answerTemplate?.(input) ??
        `[canned] 依據 ${citations.length} 段來源回答:${input.question}`;

      return { answer, citations, model: MODEL };
    },
  };
}
