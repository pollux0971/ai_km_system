/**
 * E03-S029 "File-processing status UI". SOURCE_BASELINE.md gives this
 * story only a bare title; the epic's expanded title
 * ("File-processing status UI") plus its position immediately after
 * E03-S028 ("File-chat entry flow") is the scope signal: this is the
 * status feedback for files attached via EITHER E03-S008's existing
 * composer picker or E03-S028's new file-chat entry — not a new
 * attachment mechanism of its own, and not the actual parsing/OCR/
 * embedding work itself (that's E06 Knowledge Ingestion, Team B,
 * which doesn't exist yet).
 *
 * `classifyFileProcessing` is a pure, synchronous function — same
 * shape as answer-state.ts's `classifyAnswerState`, deliberately: this
 * mock has no real backend to report an actual processing outcome
 * from, so a deterministic mock trigger (the same "[模擬:X]"
 * bracketed-marker convention MOCK_ANSWER_STATE_TRIGGERS already
 * established) is the only way to make the failure path genuinely
 * reachable and testable end-to-end, rather than leaving it
 * theoretically coded but never actually triggerable through the UI.
 *
 * Two entry points deliberately expose two different shapes:
 * `simulateFileProcessing` (async, with a visible delay) is for
 * message-thread.tsx, where showing a brief "檔案處理中…" phase before
 * settling is the actual point of this story (mirrors E03-S011's
 * runGenerationPhases: a phase worth showing needs enough visible time
 * to actually be read). `classifyFileProcessing` (sync, no delay) is
 * for conversations/new-file/page.tsx, which already has its own
 * generic "建立中…" pending indicator for its whole multi-step
 * create-then-attach flow — adding a second, separate visible phase
 * there would be a new UI concept that story never asked for.
 */
export type FileProcessingStatus = "done" | "failed";

export const MOCK_FILE_PROCESSING_FAILURE_TRIGGER = "[模擬:PROCESSING_FAILED]";

export function classifyFileProcessing(fileNames: string[]): FileProcessingStatus {
  return fileNames.some((name) => name.includes(MOCK_FILE_PROCESSING_FAILURE_TRIGGER)) ? "failed" : "done";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `delayMs` defaults to 800 — long enough to actually be seen, short
 * enough not to feel like a stall; unit tests pass 0. See
 * generation-status.ts's runGenerationPhases for the same reasoning
 * applied to its own default.
 */
export async function simulateFileProcessing(fileNames: string[], delayMs = 800): Promise<FileProcessingStatus> {
  if (delayMs > 0) await delay(delayMs);
  return classifyFileProcessing(fileNames);
}
