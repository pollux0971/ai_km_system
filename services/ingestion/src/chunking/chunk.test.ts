import { describe, expect, it } from "vitest";
import { chunkDocument, ChunkingError } from "./chunk.js";

describe("chunkDocument", () => {
  it("PF0 偏移量必須能從原文精確切出 chunk 內容", () => {
    const text = "第一段內容。\n\n第二段內容,稍微長一點。\n\n第三段。";
    const chunks = chunkDocument("doc-1", text, { targetSize: 12, overlap: 2 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(text.slice(c.startOffset, c.endOffset)).toBe(c.text);
    }
  });

  it("PF0 chunk id 必須穩定——重新切塊不得讓既有引用失效", () => {
    const text = "穩定性測試。".repeat(20);
    const a = chunkDocument("doc-1", text, { targetSize: 30, overlap: 5 });
    const b = chunkDocument("doc-1", text, { targetSize: 30, overlap: 5 });
    expect(a.map((c) => c.chunkId)).toEqual(b.map((c) => c.chunkId));
    expect(a.map((c) => c.text)).toEqual(b.map((c) => c.text));
  });

  it("PF0 overlap >= targetSize 會導致無法前進,必須在入口擋下", () => {
    expect(() => chunkDocument("doc-1", "abc", { targetSize: 10, overlap: 10 })).toThrow(
      ChunkingError,
    );
  });

  it("PF0 空白文件回傳空陣列而非一個空 chunk", () => {
    expect(chunkDocument("doc-1", "   \n\n  ")).toEqual([]);
  });

  it("PF0 documentId 為空時拒絕——引用無法回溯", () => {
    expect(() => chunkDocument("", "內容")).toThrow(ChunkingError);
  });

  it("PF0 硬切必須被標記,讓評估看得到切塊品質", () => {
    const text = "無標點無換行".repeat(50);
    const chunks = chunkDocument("doc-1", text, { targetSize: 40, overlap: 5 });
    expect(chunks.some((c) => c.hardCut)).toBe(true);
  });
});
