/**
 * PDF text-item join rules — pure logic, no pdfjs, no I/O. E06-S008.
 *
 * A PDF has no linear text. It stores instructions of the shape "draw this
 * glyph at (x, y)". The plain-text string that gets stored (and that
 * `chunkDocument`'s character offsets point into) is something *we*
 * construct by joining the glyph runs ("text items") that a PDF parser
 * reports back, in reading order. That construction is a real editorial
 * decision — not a neutral fact about the document — so it lives here as its
 * own small, directly-tested, versioned function instead of being buried
 * inline in a page-extraction loop.
 *
 * `JOIN_RULES_VERSION` is folded into `extractorVersion` (see
 * `pdf-extract.ts`) precisely so that changing any rule below is a visible,
 * re-index-triggering event rather than a silent drift in what "the text"
 * of a previously-indexed PDF means.
 *
 * Rules implemented, each covered by a direct test in `join.test.ts`:
 *  1. `hasEOL` on an item means "the next item starts a new line" → insert
 *     `\n`, not a space.
 *  2. Inter-item spacing on the same line: pdf.js does not tell us whether
 *     two consecutive items were visually separated by a space — only their
 *     geometry does. If the horizontal gap between the end of one item and
 *     the start of the next exceeds a small fraction of the local glyph
 *     height, we treat that as a real word-space; a near-zero gap means the
 *     items are two halves of the same run (e.g. split by a font change)
 *     and must NOT gain a space.
 *  3. Ligatures: some (especially embedded, subset) fonts encode "fi", "fl",
 *     "ff", "ffi", "ffl", and the long-s ligatures as single Unicode
 *     Alphabetic Presentation Form codepoints (U+FB00–U+FB06) rather than as
 *     separate letters. Left alone, that hides the plain letters from
 *     search/embedding and from chunk boundary detection. We expand them to
 *     their plain-letter form before anything else touches the string.
 *  4. End-of-line hyphenation: when a line ends in a hyphen directly after a
 *     letter (`hasEOL` true) and the following line begins with a lowercase
 *     letter, that is treated as a word split across the line break — the
 *     hyphen is dropped and the two items are joined with no separator. A
 *     hyphen at end-of-line followed by an uppercase letter (e.g. a new
 *     sentence or heading) is left alone, since that shape is far more often
 *     a genuine hyphen than a split word.
 *
 * This heuristic is deliberately narrow — it cannot be "correct" for every
 * PDF ever produced (no join heuristic can, since the join is our own
 * invention, not the document's). It only has to be stable and versioned.
 */

export const JOIN_RULES_VERSION = 1;

/**
 * A minimal, pdfjs-independent view of one glyph run. `pdf-extract.ts` maps
 * pdfjs's `TextItem` (str/hasEOL/transform/width/height) into this shape so
 * that this module has no dependency on pdfjs's types and can be tested with
 * plain object literals.
 */
export interface JoinableTextItem {
  readonly str: string;
  /** True when pdf.js determined that a line break follows this item. */
  readonly hasEOL: boolean;
  /** Left edge of the item's bounding box, in the page's device space. */
  readonly x: number;
  /** Right edge of the item's bounding box (x + width), same space as `x`. */
  readonly endX: number;
  /** Approximate glyph height, used only to scale the same-line gap threshold. */
  readonly height: number;
}

const LIGATURES: ReadonlyArray<readonly [string, string]> = [
  ["ﬀ", "ff"],
  ["ﬁ", "fi"],
  ["ﬂ", "fl"],
  ["ﬃ", "ffi"],
  ["ﬄ", "ffl"],
  ["ﬅ", "st"],
  ["ﬆ", "st"],
];

/** Expands PDF ligature codepoints to their plain-letter form. Exported for its own direct test. */
export function expandLigatures(str: string): string {
  let out = str;
  for (const [ligature, expansion] of LIGATURES) {
    if (out.includes(ligature)) {
      out = out.split(ligature).join(expansion);
    }
  }
  return out;
}

/** Same-line word-space threshold, as a fraction of the taller of the two items' heights. */
const SPACE_GAP_RATIO = 0.2;

/**
 * True when `prevStr` ends in a hyphen that looks like an end-of-line word
 * split (letter immediately before the hyphen) and `nextStr` continues with
 * a lowercase letter — the shape of a hyphenated word wrapped across a line,
 * not a genuine hyphen ending a line.
 */
function looksLikeHardHyphenation(prevStr: string, nextStr: string): boolean {
  if (prevStr.length < 2 || !prevStr.endsWith("-")) return false;
  const beforeHyphen = prevStr.charAt(prevStr.length - 2);
  if (!/[a-zA-Z]/.test(beforeHyphen)) return false;
  return /[a-z]/.test(nextStr.charAt(0));
}

/**
 * Joins `items`, already in reading order, into a single string per the
 * rules documented above. Pure: no pdfjs, no I/O, deterministic for a given
 * input array.
 */
export function joinTextItems(items: readonly JoinableTextItem[]): string {
  let out = "";
  let prev: JoinableTextItem | null = null;

  for (const item of items) {
    const str = expandLigatures(item.str);

    if (prev === null) {
      out += str;
    } else if (prev.hasEOL) {
      if (looksLikeHardHyphenation(prev.str, str)) {
        out = out.slice(0, -1);
      } else {
        out += "\n";
      }
      out += str;
    } else {
      const gapThreshold = Math.max(prev.height, item.height) * SPACE_GAP_RATIO;
      if (item.x - prev.endX > gapThreshold) {
        out += " ";
      }
      out += str;
    }

    prev = item;
  }

  if (prev !== null && prev.hasEOL) {
    out += "\n";
  }

  return out;
}
