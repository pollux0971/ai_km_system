/**
 * E05-S019 "Index progress". The THIRD and final ephemeral per-file
 * phase in the upload→parse→index sequence, following E05-S017's
 * upload-progress.ts and E05-S018's parse-progress.ts — same "each
 * story owns its own tiny delay primitive in its own file" precedent
 * generation-status.ts/file-processing.ts already established, and the
 * same multi-phase-single-operation shape generation-status.ts's own
 * searching→reading→generating sequence uses. Nothing here is
 * persisted onto KnowledgeBaseDocument; see parse-progress.ts's own
 * doc comment for the full reasoning on why S017/S018/S019 stay purely
 * transient UI state while E05-S020/S029 (note the "state", not
 * "progress", in both their titles) are where persisted lifecycle
 * state actually belongs.
 *
 * Deliberately has no mock failure trigger and no classification
 * function, same as parse-progress.ts — an indexing failure path is
 * E05-S020's own dedicated scope, not this one's. This function always
 * succeeds; it exists purely to give the "索引中…" phase real, visible
 * time on screen.
 *
 * `delayMs` defaults to 500, same value and reasoning as
 * upload-progress.ts/parse-progress.ts. Unit tests pass 0;
 * knowledge-document-upload.test.tsx and knowledge-document-list.test.tsx
 * both mock this module wholesale (same idiom already used for its two
 * siblings) so pre-existing tests stay instant and unaffected by this
 * story's addition.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function simulateIndexStep(delayMs = 500): Promise<void> {
  if (delayMs > 0) await delay(delayMs);
}
