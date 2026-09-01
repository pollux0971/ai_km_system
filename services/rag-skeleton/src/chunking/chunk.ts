/**
 * Document chunking — pure logic, no model, no I/O. PF0.
 *
 * This is one of the three RAG stages that needs no model at all, so it is
 * implemented for real from day one. There is no stub counterpart.
 *
 * CHARACTER OFFSETS ARE NOT OPTIONAL. Source citation is the product's core
 * claim; a citation that names a document but cannot point at the passage is
 * not verifiable by the person reading the answer. Offsets are carried through
 * every later stage so the UI can highlight the exact span.
 *
 * Boundaries are chosen at paragraph breaks where possible, falling back to
 * sentence terminators (both ASCII and CJK), and only then to a hard cut. A
 * hard cut mid-sentence is recorded on the chunk so downstream evaluation can
 * see how often it happens rather than guessing.
 */

export interface Chunk {
  readonly chunkId: string;
  readonly documentId: string;
  readonly text: string;
  /** Inclusive character offset into the ORIGINAL document text. */
  readonly startOffset: number;
  /** Exclusive character offset into the ORIGINAL document text. */
  readonly endOffset: number;
  readonly ordinal: number;
  /** True when the boundary fell mid-sentence because no break was available. */
  readonly hardCut: boolean;
}

export interface ChunkOptions {
  /** Target chunk size in characters. */
  readonly targetSize?: number;
  /** Characters of overlap between consecutive chunks. */
  readonly overlap?: number;
  /** How far back to search for a natural boundary before hard-cutting. */
  readonly boundarySearchWindow?: number;
}

const DEFAULTS = {
  targetSize: 480,
  overlap: 60,
  boundarySearchWindow: 120,
} as const;

export class ChunkingError extends Error {
  override readonly name = "ChunkingError";
}

/** Paragraph break: two or more newlines, optionally with whitespace between. */
const PARAGRAPH_BREAK = /\n\s*\n/g;

/** Sentence terminators covering ASCII and CJK punctuation. */
const SENTENCE_END = /[.!?。！？；;]\s*/g;

function lastMatchBefore(text: string, pattern: RegExp, limit: number, floor: number): number {
  const re = new RegExp(pattern.source, "g");
  let best = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    if (end > limit) break;
    if (end >= floor) best = end;
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return best;
}

/**
 * Splits `text` into overlapping chunks with stable ids.
 *
 * Determinism matters: the same document must produce byte-identical chunk ids
 * on every run, or re-indexing silently invalidates every stored citation.
 */
export function chunkDocument(
  documentId: string,
  text: string,
  options: ChunkOptions = {},
): readonly Chunk[] {
  if (typeof documentId !== "string" || documentId.trim() === "") {
    throw new ChunkingError("documentId 不得為空——chunk id 由它衍生,空值會讓引用無法回溯。");
  }
  if (typeof text !== "string") {
    throw new ChunkingError("text 必須是字串。");
  }

  const targetSize = options.targetSize ?? DEFAULTS.targetSize;
  const overlap = options.overlap ?? DEFAULTS.overlap;
  const window = options.boundarySearchWindow ?? DEFAULTS.boundarySearchWindow;

  if (targetSize <= 0) throw new ChunkingError("targetSize 必須大於 0。");
  if (overlap < 0) throw new ChunkingError("overlap 不得為負。");
  if (overlap >= targetSize) {
    throw new ChunkingError(
      `overlap (${overlap}) 必須小於 targetSize (${targetSize}),否則切塊無法前進會產生無限迴圈。`,
    );
  }

  if (text.trim() === "") return [];

  const chunks: Chunk[] = [];
  let cursor = 0;
  let ordinal = 0;

  while (cursor < text.length) {
    const remaining = text.length - cursor;
    let end: number;
    let hardCut = false;

    if (remaining <= targetSize) {
      end = text.length;
    } else {
      const limit = cursor + targetSize;
      const floor = Math.max(cursor + 1, limit - window);

      const paragraph = lastMatchBefore(text.slice(cursor), PARAGRAPH_BREAK, targetSize, floor - cursor);
      const sentence =
        paragraph === -1
          ? lastMatchBefore(text.slice(cursor), SENTENCE_END, targetSize, floor - cursor)
          : -1;

      if (paragraph !== -1) {
        end = cursor + paragraph;
      } else if (sentence !== -1) {
        end = cursor + sentence;
      } else {
        end = limit;
        hardCut = true;
      }
    }

    const slice = text.slice(cursor, end);
    if (slice.trim() !== "") {
      chunks.push({
        chunkId: `${documentId}#${ordinal}`,
        documentId,
        text: slice,
        startOffset: cursor,
        endOffset: end,
        ordinal,
        hardCut,
      });
      ordinal += 1;
    }

    if (end >= text.length) break;
    const next = end - overlap;
    // Guard against a boundary landing so early that the cursor would not move.
    cursor = next > cursor ? next : end;
  }

  return chunks;
}
