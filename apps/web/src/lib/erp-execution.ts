/**
 * E09-S006 "Query loading state". Same "each story owns its own tiny
 * delay primitive in its own file" precedent index-progress.ts/
 * parse-progress.ts/upload-progress.ts already establish — this is the
 * ERP-domain equivalent of simulateIndexStep, existing purely to give
 * the "執行中…" phase real, visible time on screen. Always succeeds;
 * a genuine execution FAILURE is executeErpQuery's own concern (the
 * lib mutation that follows this), not this timing primitive's.
 *
 * `delayMs` defaults to 500, same value and reasoning as its siblings.
 * Unit tests pass 0.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function simulateErpQueryExecution(delayMs = 500): Promise<void> {
  if (delayMs > 0) await delay(delayMs);
}
