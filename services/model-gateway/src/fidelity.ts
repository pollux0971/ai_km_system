/**
 * Provider Fidelity, re-declared here rather than imported.
 *
 * `services/rag-skeleton` owns the full mechanism (`src/evidence-tier.ts`:
 * the ordering, `requireProviderFidelity`, the limits table). This package
 * only needs the vocabulary to label its own providers, and a
 * model-gateway → rag-skeleton dependency would point the wrong way: the
 * skeleton is the thing being dissolved into real services, not a shared
 * library for them to depend on.
 *
 * When g5 moves the real providers here, the mechanism moves with them and
 * this file is replaced by the single canonical one.
 */
export type ProviderFidelity = "PF0" | "PF1" | "PF2" | "PF3";
