/**
 * `IngestionService` — the index-time pipeline: parse → chunk → embed → store.
 * **Scaffold only.** E06-S022 (chunking), E06-S008 (PDF text extraction) and
 * E06-S042 (the pipeline itself) fill it in.
 *
 * Embedding goes through the Model Gateway in-process
 * (`app.modelGateway.embed()`, ADR 0007), the same seam query-time retrieval
 * uses. That is not tidiness: if index-time and query-time embeddings ever
 * come from different code paths, stored vectors stop being comparable to
 * query vectors and retrieval degrades silently. E06-S026 puts the model and
 * version in the store so that divergence becomes loud instead.
 */

export class IngestionNotImplementedError extends Error {
  override readonly name = "IngestionNotImplementedError";
}

export interface IngestionService {
  readonly componentId: string;
  /**
   * Throws until E06-S042 lands.
   *
   * Throwing rather than reporting "0 chunks indexed": a scanned or
   * image-only PDF extracts to an empty string, and a pipeline that quietly
   * stores nothing leaves the user staring at "no matching documents" for a
   * document they just uploaded successfully.
   */
  ingest(): Promise<never>;
}

export function createIngestionScaffold(): IngestionService {
  return {
    componentId: "ingestion:scaffold",
    async ingest(): Promise<never> {
      throw new IngestionNotImplementedError(
        "services/ingestion 尚未實作。這是 E06-S041 建立的空殼,實作由 E06-S022(chunking 搬移)、" +
          "E06-S008(PDF 文字抽取,保留字元偏移量)、E06-S042(索引管線)補上。" +
          "此處刻意拋錯而非回報「索引了 0 個 chunk」——掃描檔或純圖片 PDF 抽出來是空字串," +
          "安靜存 0 個 chunk 會讓使用者對著一份剛上傳成功的文件看到「查無資料」。",
      );
    },
  };
}
