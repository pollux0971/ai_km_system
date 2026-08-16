/**
 * E09-S017 "Export progress". Same "each story owns its own tiny delay
 * primitive in its own file" precedent index-progress.ts/parse-progress.ts/
 * upload-progress.ts/erp-execution.ts already establish — this is the
 * export flow's own equivalent, existing purely to give a "匯出中…" phase
 * real, visible time on screen. E09-S016's own CSV generation is a small,
 * synchronous, in-memory string build with nothing genuinely incremental
 * to measure, so an indeterminate simulated delay (not a fabricated %
 * progress bar) is the honest MVP simplification here, same as
 * erp-execution.ts's own reasoning for query execution.
 *
 * `delayMs` defaults to 500, same value and reasoning as its siblings.
 * Unit tests pass 0.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function simulateErpExportProgress(delayMs = 500): Promise<void> {
  if (delayMs > 0) await delay(delayMs);
}
