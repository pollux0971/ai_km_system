import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { chunkDocument } from "../chunking/chunk.js";
import { extractPdfText, PdfEmptyTextError, PdfEncryptedError } from "./pdf-extract.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(dir, "fixtures", name)));
}

/**
 * Committed golden — the exact expected extraction of `cjk-non-embedded.pdf`
 * with today's pdfjs-dist@6.3.289 + join-rules@1. Computed once, independently
 * cross-checked with a standalone Python sha256 over the same UTF-8 bytes,
 * and hard-coded here rather than compared against a second in-process
 * extraction: a same-process double-extraction would pass even if a future
 * pdfjs-dist upgrade silently changed what gets extracted, since both calls
 * would drift together. This constant is the only thing that can catch that.
 */
const CJK_GOLDEN_SHA256 = "998835e3530dcb1a6f4f38b9fcc2e067c7426ca5c6abce61736e966d1f0f4306";

describe("extractPdfText", () => {
  it("AC1 偏移量必須能從落庫的原文精確切出 chunk 內容(真實 PDF,走完整 chunkDocument)", async () => {
    const { text } = await extractPdfText(fixture("cjk-non-embedded.pdf"));
    const chunks = chunkDocument("pdf-doc-1", text);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(text.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.text);
    }
  });

  it("AC2 extractorVersion 與 text 一起回傳,且由 pdfjs-dist 版本 + join-rules 版本組成", async () => {
    const result = await extractPdfText(fixture("cjk-non-embedded.pdf"));
    expect(result.extractorVersion).toBe("pdfjs-dist@6.3.289+join-rules@1");
    expect(result.extractorVersion).toMatch(/^pdfjs-dist@6\.3\.289\+join-rules@\d+$/);
  });

  it("AC3 非內嵌字型的中文 PDF(/Encoding /UniGB-UCS2-H,無 /FontFile)必須正確抽出真實中文,而非空字串或亂碼", async () => {
    const { text, pageCount } = await extractPdfText(fixture("cjk-non-embedded.pdf"));
    expect(pageCount).toBe(2);
    expect(text).toContain("知識管理系統設計文件");
    expect(text).toContain("文件擷取管線包含四個階段");
    // 不是空字串,也不是常見的亂碼替代字元
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain("�");
  });

  it("AC4a 空白/純圖片 PDF 抽出 0 字元 → 明確拒絕,不得靜默回傳空字串", async () => {
    await expect(extractPdfText(fixture("image-only.pdf"))).rejects.toBeInstanceOf(PdfEmptyTextError);
  });

  it("AC4b 加密 PDF → 明確拒絕,而非嘗試以無密碼開啟", async () => {
    await expect(extractPdfText(fixture("encrypted.pdf"))).rejects.toBeInstanceOf(PdfEncryptedError);
  });

  it("AC5 決定性:同一份 PDF 重複抽取,結果逐字元相同(循序抽取頁面,不依賴排程)", async () => {
    const a = await extractPdfText(fixture("cjk-non-embedded.pdf"));
    const b = await extractPdfText(fixture("cjk-non-embedded.pdf"));
    expect(a.text).toBe(b.text);
    expect(a.pageCount).toBe(b.pageCount);
  });

  it("AC6 逐位元穩定性:抽取結果的 sha256 必須比對落庫的 golden 值,而非兩次即時抽取互比", async () => {
    const { text } = await extractPdfText(fixture("cjk-non-embedded.pdf"));
    const actualHash = createHash("sha256").update(text, "utf8").digest("hex");
    expect(actualHash).toBe(CJK_GOLDEN_SHA256);
  });
});
