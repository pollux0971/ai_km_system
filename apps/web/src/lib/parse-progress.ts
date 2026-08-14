/**
 * E05-S018 "Parse progress". A second, separate phase on top of
 * E05-S017's upload-progress.ts, mirroring how generation-status.ts
 * (E03-S011) shows MULTIPLE sequential phases (searching → reading →
 * generating) for a single operation as transient, non-persisted
 * display state, not as a field written onto the underlying entity.
 * "Parsing" here is the SAME kind of ephemeral, per-file phase as
 * "uploading" — not a new persisted status/lifecycle on
 * KnowledgeBaseDocument. That distinction matters: knowledge-documents.ts's
 * own doc comment already reserves any such field for whichever later
 * story actually needs one, and the word choice across this range of
 * story titles is itself a signal — S017/S018/S019 are all "progress"
 * (in-flight, transient), while S020 "Processing failure state" and
 * S029 "document state badges" are explicitly where PERSISTED state
 * enters the picture. Inventing a `status` field now would be reaching
 * into that later scope ahead of time.
 *
 * A separate module from upload-progress.ts, not a second parameter on
 * simulateUploadStep — same "each story owns its own tiny delay
 * primitive in its own file" precedent generation-status.ts/
 * file-processing.ts already established despite being extremely
 * similar in shape (two distinct E03 stories, two distinct files).
 *
 * Deliberately has no mock failure trigger and no classification
 * function (unlike file-processing.ts's classifyFileProcessing) — a
 * parse failure path is E05-S020's own dedicated scope, not this
 * story's. This function always succeeds; it exists purely to give the
 * "解析中…" phase real, visible time on screen.
 *
 * `delayMs` defaults to 500, same reasoning and same value as
 * upload-progress.ts's own simulateUploadStep. Unit tests pass 0;
 * knowledge-document-upload.test.tsx mocks this module wholesale (same
 * idiom already used for upload-progress.ts) so pre-existing tests stay
 * instant and unaffected by this story's addition.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function simulateParseStep(delayMs = 500): Promise<void> {
  if (delayMs > 0) await delay(delayMs);
}
