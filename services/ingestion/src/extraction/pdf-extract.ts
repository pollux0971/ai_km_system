/**
 * PDF text extraction (E06-S008) — minimal, character-offset-preserving.
 *
 * No PDF library gives character offsets into "the original document",
 * because a PDF has no linear text: it stores "draw this glyph at (x, y)".
 * The plain-text string returned here is something *we* construct by
 * joining text items page by page (see `join.ts` for the join rules
 * themselves, which are a separate, versioned, pure function). Character
 * offsets used later by `chunkDocument` are anchored to exactly this
 * string, not to "the PDF" — which is why:
 *
 *  - The returned text MUST be persisted alongside the document by the
 *    caller (E06-S042's ingestion pipeline). Offsets are meaningless
 *    without the exact string they were computed against.
 *  - `extractorVersion` is returned together with the text, in the same
 *    result object, so a caller cannot persist one without the other. It is
 *    composed of the installed pdfjs-dist version plus `JOIN_RULES_VERSION`
 *    (our own join rules' version) — same reasoning as E06-S026's embedding
 *    version: after either changes, re-extraction of the same PDF can
 *    legitimately differ, and without this field there is no way to tell
 *    "the source text changed on purpose" from "something broke".
 *
 * Unicode normalisation policy (hard-coded, see story E06-S008): the
 * returned text is stored EXACTLY as `join.ts` produces it — no
 * `String.prototype.normalize()` call is applied here or anywhere
 * downstream. `join.ts`'s ligature expansion (U+FB00–U+FB06 → plain
 * letters) is a narrow, versioned, documented part of the join rules, not
 * general Unicode normalisation, and is folded into `JOIN_RULES_VERSION`.
 * Chunking (`chunking/chunk.ts`) must never normalise the text it receives
 * either — doing so after the fact would shift every offset computed
 * against the un-normalised string.
 *
 * CJK correctness: in Node, pdfjs needs `cMapUrl` and `standardFontDataUrl`
 * pointed at the installed package's own `cmaps/` and `standard_fonts/`
 * directories. Without `cMapUrl`, a PDF whose CJK font is not embedded (very
 * common — many PDF producers reference one of the predefined, non-embedded
 * CJK fonts via a predefined CMap encoding such as `UniGB-UCS2-H`, per PDF
 * spec §9.7.4.2) extracts as an EMPTY STRING with **no thrown error** —
 * pdf.js only logs an internal warning. That silent-empty-result shape is
 * exactly the "confidently wrong, nobody notices" failure this project
 * treats as most dangerous, which is why the fixture used to prove this
 * behaves correctly deliberately uses a non-embedded CJK font (see
 * `pdf-extract.test.ts` and `fixtures/cjk-non-embedded.pdf`).
 *
 * NOTE ON THE PARAMETER NAMES: pdfjs's `cMapUrl`/`standardFontDataUrl`
 * options are, despite the name, plain string-concatenated with a CMap/font
 * filename internally (`${baseUrl}${filename}`) rather than resolved via the
 * URL API — passing a `file://` URL string here causes pdfjs's Node file
 * reader to try to open a path literally starting with `file:///…`, which
 * does not exist, and produces the exact same silent "Unable to load CMap
 * data" failure this story is about. The correct value in Node is a plain
 * filesystem directory path with a trailing separator, which is what
 * `resourceDir()` below returns.
 */
import { createRequire } from "node:module";
import path from "node:path";

import { joinTextItems, JOIN_RULES_VERSION, type JoinableTextItem } from "./join.js";

const require = createRequire(import.meta.url);

/** The subset of pdfjs's `TextItem` this module actually reads. */
interface PdfJsTextItem {
  readonly str: string;
  readonly hasEOL: boolean;
  readonly transform: readonly number[];
  readonly width: number;
  readonly height: number;
}

export interface PdfExtractionResult {
  /** The joined text. Must be persisted verbatim alongside the document — offsets are anchored to it. */
  readonly text: string;
  /** `pdfjs-dist@<version>+join-rules@<JOIN_RULES_VERSION>`. Persist together with `text`. */
  readonly extractorVersion: string;
  readonly pageCount: number;
}

export class PdfExtractionError extends Error {
  override readonly name: string = "PdfExtractionError";
}

/** The PDF requires a password. Extraction refuses rather than guessing at "empty is fine". */
export class PdfEncryptedError extends PdfExtractionError {
  override readonly name = "PdfEncryptedError";
}

/**
 * Extraction produced zero characters (scanned/image-only PDF, or a CJK PDF
 * extracted without `cMapUrl`). Refused explicitly rather than silently
 * reporting "0 chunks indexed" — see `services/ingestion/src/service.ts`.
 *
 * Deliberately NOT a minimum-length check: how short is "too short" is a
 * product decision this story does not make. Only exact-zero is blocked.
 */
export class PdfEmptyTextError extends PdfExtractionError {
  override readonly name = "PdfEmptyTextError";
}

let cachedPdfjsVersion: string | undefined;

/** Reads pdfjs-dist's own installed version at runtime rather than hard-coding it a second time. */
function pdfjsVersion(): string {
  if (cachedPdfjsVersion === undefined) {
    const pkg = require("pdfjs-dist/package.json") as { readonly version: string };
    cachedPdfjsVersion = pkg.version;
  }
  return cachedPdfjsVersion;
}

export function extractorVersion(): string {
  return `pdfjs-dist@${pdfjsVersion()}+join-rules@${JOIN_RULES_VERSION}`;
}

/** Absolute path (with trailing separator) to a resource directory shipped inside the installed pdfjs-dist package. */
function resourceDir(subdir: string): string {
  const pkgJsonPath = require.resolve("pdfjs-dist/package.json");
  return path.join(path.dirname(pkgJsonPath), subdir) + path.sep;
}

function isPasswordException(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && (err as { name: unknown }).name === "PasswordException";
}

/** Page-to-page separator in the joined document text. */
const PAGE_SEPARATOR = "\n\n";

/**
 * Extracts text from a PDF, preserving the character offsets that
 * `chunkDocument` will later slice against (the offsets are into the
 * returned `text`, not into "the PDF" — see module doc comment).
 *
 * Extracts pages SEQUENTIALLY (not `Promise.all`) and joins them in document
 * order: determinism must not depend on scheduling, only on page order.
 */
export async function extractPdfText(data: Uint8Array): Promise<PdfExtractionResult> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = getDocument({
    data,
    cMapUrl: resourceDir("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: resourceDir("standard_fonts"),
    // Remove environment dependence, per E06-S008: extraction must not vary
    // by host fonts or CSS font-matching.
    //
    // NOTE: `isEvalSupported` (used to disable eval()-based glyph-path
    // codegen in older pdfjs releases) is NOT set here because pdfjs-dist
    // 6.3.289 removed the option entirely — `DocumentInitParameters` no
    // longer declares it (verified: it is a TypeScript compile error to pass
    // it), and grepping the built `legacy/build/pdf.worker.mjs` for
    // `new Function(`/`eval(` finds zero matches. The eval-based code path
    // this flag used to gate no longer exists in this version, so there is
    // nothing left to disable.
    useSystemFonts: false,
    disableFontFace: true,
  });

  let doc: Awaited<typeof loadingTask.promise>;
  try {
    doc = await loadingTask.promise;
  } catch (err) {
    if (isPasswordException(err)) {
      throw new PdfEncryptedError(
        "PDF 已加密,拒絕抽取——加密文件的抽取行為不在此 story 定義範圍內,fail closed 而非猜測。",
      );
    }
    throw err;
  }

  const pageTexts: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    // Sequential `await` in a for-loop, deliberately not `Promise.all`:
    // determinism requires page order to come from document order alone.
    // eslint-disable-next-line no-await-in-loop
    const page = await doc.getPage(pageNumber);
    // eslint-disable-next-line no-await-in-loop
    const textContent = await page.getTextContent();

    const items: JoinableTextItem[] = [];
    for (const raw of textContent.items) {
      if (typeof (raw as PdfJsTextItem).str !== "string") continue; // TextMarkedContent, not TextItem
      const textItem = raw as PdfJsTextItem;
      const x = textItem.transform[4] ?? 0;
      items.push({
        str: textItem.str,
        hasEOL: textItem.hasEOL,
        x,
        endX: x + textItem.width,
        height: textItem.height || 1,
      });
    }

    pageTexts.push(joinTextItems(items));
  }

  const text = pageTexts.join(PAGE_SEPARATOR);

  if (text.length === 0) {
    throw new PdfEmptyTextError(
      "抽取結果為空字串(0 字元)——掃描檔、純圖片 PDF,或未內嵌字型且缺少 cMapUrl 的 CJK PDF 都會落到這裡。" +
        "拒絕靜默視為「索引了 0 個 chunk」。",
    );
  }

  return { text, extractorVersion: extractorVersion(), pageCount: doc.numPages };
}
