/**
 * E05-S017 "Upload progress". Same "long enough for a human to
 * actually read, short enough not to feel like a stall" reasoning as
 * generation-status.ts's runGenerationPhases / file-processing.ts's
 * simulateFileProcessing — applied here to a per-FILE step within
 * KnowledgeDocumentUpload's (E05-S011-S013) existing sequential upload
 * loop, so its progress indicator ("上傳中…（第 N / total 筆）") has
 * actual visible time to be read as it advances, rather than flashing
 * through every file near-instantly the way addKnowledgeBaseDocument's
 * own near-zero-latency mock resolution would otherwise produce.
 *
 * A separate module from knowledge-documents.ts, not a new parameter
 * on addKnowledgeBaseDocument itself — that function's job is
 * recording a document, unchanged since S011; this delay is a
 * presentation-layer concern about how long the CLIENT shows each
 * step, not something the (mock) recording operation itself should
 * know about. Keeping it separate also means knowledge-documents.ts's
 * own ~40 existing direct unit tests (S011-S015) are completely
 * unaffected by this story — this file has no callers there.
 *
 * `delayMs` defaults to 500 — shorter than simulateFileProcessing's
 * 800ms default since this can run once per file within a single
 * multi-file batch (a 5-file folder upload would otherwise take 4+
 * seconds just in deliberate pauses). Unit tests pass 0;
 * knowledge-document-upload.test.tsx mocks this module wholesale (same
 * idiom message-thread.test.tsx already uses for generation-status.ts/
 * file-processing.ts) so its own pre-existing tests stay instant and
 * unaffected by this story's addition.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function simulateUploadStep(delayMs = 500): Promise<void> {
  if (delayMs > 0) await delay(delayMs);
}
