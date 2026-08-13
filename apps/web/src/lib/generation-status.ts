/**
 * E03-S011: Searching/Reading/Generating status UI. Unlike most stories
 * in this epic, SOURCE_BASELINE.md gives this one concrete content
 * (line 1146-1152):
 *
 *   E03-S11 Generation Status
 *   顯示：
 *   - Searching
 *   - Reading
 *   - Generating
 *
 * `GenerationPhase`'s values are these exact English words (traceable
 * straight back to the source), while GENERATION_PHASE_LABELS holds the
 * Traditional Chinese display text — same split as ai-models.ts's
 * AiModel id vs label. The three-item bullet list is read as the
 * sequence's order (search → read → generate is also the standard,
 * obvious RAG pipeline order — retrieve, then process what was
 * retrieved, then produce an answer — not an arbitrary invented
 * ordering).
 *
 * Each phase is shown briefly BEFORE any reply text exists — once
 * lib/streaming.ts's mock text actually starts arriving, the growing
 * text itself is the live indicator that generation is happening, so
 * there's no phase after "generating"; message-thread.tsx clears the
 * phase back to null the moment real content starts.
 */
export type GenerationPhase = "searching" | "reading" | "generating";

export const GENERATION_PHASES: GenerationPhase[] = ["searching", "reading", "generating"];

export const GENERATION_PHASE_LABELS: Record<GenerationPhase, string> = {
  searching: "搜尋中…",
  reading: "讀取中…",
  generating: "生成中…",
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Yields each phase, then pauses `delayMs` before advancing — including
 * after the last phase ("generating"), not just between phases. Without
 * that trailing pause, "generating"'s visible duration would depend
 * entirely on how fast lib/streaming.ts's first real chunk happens to
 * arrive (near-instant at its default pacing) — flashing by in
 * practice rather than actually being shown the way "searching" and
 * "reading" are. The trailing pause gives all three phases the same
 * deliberate, equal visible beat. `delayMs` defaults to 600 — long
 * enough for a human to actually read a phase label before it changes;
 * unit tests pass 0.
 */
export async function* runGenerationPhases(delayMs = 600): AsyncGenerator<GenerationPhase> {
  for (const phase of GENERATION_PHASES) {
    yield phase;
    if (delayMs > 0) await delay(delayMs);
  }
}
