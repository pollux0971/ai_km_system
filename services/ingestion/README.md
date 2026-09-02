# services/ingestion

Owner: **Team B** — E06 Knowledge Ingestion & Indexing.
Built by Team A under the 2026-09-02 Wave 1 authorization.

Document ingestion pipeline: `parse -> chunk -> embed -> store`.

Only PDF text extraction ships so far (E06-S008). OCR, the other parsers,
upload, object storage, folder sync and the worker queue remain out of scope —
E06-S001–S021 and S034–S038 are explicitly excluded from Wave 1.

A PDF has no linear text; it stores glyphs at coordinates. The text is
something **we** construct by joining text items, so offsets index our joined
text — which is why that text is persisted alongside the document, and why the
join rules are a separate versioned function with their own tests. In Node,
pdfjs without `cMapUrl` / `standardFontDataUrl` extracts non-embedded CJK fonts
as empty strings or mojibake **and nothing errors**; a committed golden SHA-256
over a real non-embedded-font Chinese fixture is what stops that returning.

Empty extraction fails closed. A scanned or image-only PDF produces an empty
string, and a pipeline that quietly stored nothing would leave the user staring
at "no matching documents" for a document they just uploaded successfully.

Embedding goes through the Model Gateway in-process — the same seam query-time
retrieval uses. If index-time and query-time embeddings ever came from
different code paths, stored vectors would stop being comparable to query
vectors and retrieval would degrade with nothing failing.

Known defect, tracked as **E06-S043**: re-ingesting the same `documentId` under
a different `scopeKey` silently rewrites visibility in both directions. Until
that closes, this plugin must not be registered into `apps/api`.

Not yet wired into `apps/api`.
