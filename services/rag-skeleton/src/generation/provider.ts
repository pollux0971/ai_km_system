/**
 * GenerationProvider — the second and last place a model is required.
 *
 * Shape kept here deliberately, the same way `embedding/provider.ts` keeps
 * `EmbeddingProvider`: this package's own interface, package-specific fields
 * included (see `evidence-tier.ts`'s `FidelityRatedComponent`), independent
 * of `@ai-km/service-model-gateway`'s own `GenerationProvider` shape.
 *
 * WHAT MOVED OUT (E12-S033): the concrete canned implementation and the
 * `assertCitationsGrounded` grounding check both relocated to
 * `@ai-km/service-model-gateway` — see
 * `services/model-gateway/src/generation/{canned.provider.ts,provider.ts}`.
 * There is now exactly ONE `assertCitationsGrounded`, not two drifting
 * copies. `./model-gateway-canned.provider.ts` in this directory is the
 * adapter that gets a `GenerationProvider` matching THIS file's interface by
 * routing through `createModelGateway().generate()`, mirroring how
 * `../embedding/model-gateway-deterministic.provider.ts` adapts the
 * deterministic embedding provider (E12-S032). `pipeline.ts` imports the
 * gateway's `assertCitationsGrounded` directly for its own boundary re-check
 * — see that file for why the re-check is still meaningful even though the
 * gateway-routed provider already grounds internally.
 */

import type { ProviderFidelity, FidelityRatedComponent } from "../evidence-tier.js";
import type { RetrievalHit } from "../vector/store.js";

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

export const GENERATION_FIDELITY: Readonly<Record<string, ProviderFidelity>> = Object.freeze({
  canned: "PF1",
  http: "PF2",
});
