/**
 * W1-00 acceptance demo — NOT a story, the visible half of W1-00's
 * acceptance criterion:
 *
 *   "one real PDF runs end to end, with a real citation offset that points
 *   back into the original text. Fake providers, no model required."
 *
 * `services/ingestion/src/pipeline.test.ts`'s W1-00 test already proves this
 * inside the automated suite, using `IngestionService.ingest()` end to end
 * with its default chunk size (480 chars). This demo's E06-S008 fixture is
 * only 186 characters, so at that default size the WHOLE document is a
 * single chunk — an offset check that spans the entire text technically
 * still verifies "points back into the original text" (offsets +/-1 would
 * turn it red), but as a demonstration for a human it proves nothing: there
 * is no "that passage" to point at, because the citation IS the document.
 *
 * PIPELINE ASSEMBLED DIRECTLY, NOT VIA `IngestionService.ingest()`:
 * `ingest()` does not expose `ChunkOptions` (deliberately — extending its
 * public surface for a demo would be scope creep on `services/ingestion`).
 * To get a chunk size small enough for this short fixture to produce
 * multiple paragraph-sized chunks, this script instead calls the same four
 * real functions `ingest()` calls, in the same order, by hand:
 * `extractPdfText` -> `chunkDocument(docId, text, { targetSize })` ->
 * `modelGateway.embed()` -> `vectorStore.upsert()`. Every one of those is
 * the real, production module — nothing here is a fake or a rewrite of the
 * pipeline's logic. What is NOT exercised by this script is
 * `IngestionService.ingest()`'s own validation/error-handling wrapper
 * around that sequence (empty scope, empty document, etc.) — that
 * integration path, using the default chunk size, is what
 * `pipeline.test.ts`'s W1-00 test covers.
 *
 * Run:  pnpm demo:w1-00
 *
 * Still true of this version, unchanged:
 *   - E06-S008's real fixture, no new fixture:
 *     services/ingestion/src/extraction/fixtures/cjk-non-embedded.pdf
 *   - the deterministic embedding provider through createModelGateway().embed()
 *   - the in-memory VectorStore
 *   - toRetrievalScope() directly (E04-S009, deriving scope from identity, is
 *     blocked-team-b — no mapping table is invented here)
 *   - the citation slice printed below is cut from a SEPARATE extraction of
 *     the PDF, never from the hit object, and a mismatch fails loudly and
 *     exits non-zero
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Deep imports throughout, matching pipeline.test.ts's own reasoning: the
// package barrels either pull in unrelated surface (model-gateway's barrel
// drags in the ASR route module) or simply aren't needed here (retrieval's
// barrel also exports its fastify plugin and the sqlite-vec store, neither
// of which this demo touches).
import { extractPdfText } from "../../services/ingestion/src/extraction/pdf-extract.js";
import { chunkDocument } from "../../services/ingestion/src/chunking/chunk.js";

import { createInMemoryVectorStore } from "../../services/retrieval/src/vector/store.js";
import type { RetrievalHit, VectorRecord } from "../../services/retrieval/src/vector/store.js";
import { toRetrievalScope } from "../../services/retrieval/src/authorization/scope.js";

import { createModelGateway } from "../../services/model-gateway/src/gateway.js";
import { createDeterministicEmbeddingProvider } from "../../services/model-gateway/src/embedding/deterministic.provider.js";
import type { GenerationProvider } from "../../services/model-gateway/src/generation/provider.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(
  here,
  "../../services/ingestion/src/extraction/fixtures/cjk-non-embedded.pdf",
);

/**
 * A tiny chunk size, chosen ONLY so this specific 186-character fixture
 * splits into several paragraph-sized pieces instead of one chunk covering
 * the whole document. This is a demo-legibility knob, not a production
 * tuning value — `IngestionService`'s real default (480 chars, see
 * `chunking/chunk.ts`) is what production actually uses.
 */
const DEMO_CHUNK_OPTIONS = { targetSize: 60, overlap: 10 } as const;

/**
 * A fresh `Uint8Array` on every call. Required: pdfjs-dist's worker
 * transport detaches (transfers) the ArrayBuffer backing whatever
 * `Uint8Array` is passed into `getDocument()`, so the same instance cannot be
 * read twice. This script extracts the fixture three times (one independent
 * verification extraction, one per ingested document) and needs three
 * independent reads off disk.
 */
function loadFixtureBytes(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE_PATH));
}

/**
 * Never invoked — this demo only ever calls `gateway.embed()`.
 * `createModelGateway()` requires a `generation` dependency even though
 * nothing here calls `.generate()` (same shape as pipeline.test.ts's
 * `UNUSED_GENERATION_PROVIDER`).
 */
const UNUSED_GENERATION_PROVIDER: GenerationProvider = {
  name: "fake",
  model: "w1-00-demo-embedding-only",
  fidelityCeiling: "PF1",
  async generate(): Promise<never> {
    throw new Error("This demo only calls embed() — generate() must never run.");
  },
};

const RULE = "=".repeat(78);

function section(title: string): void {
  console.log(`\n${RULE}\n${title}\n${RULE}`);
}

function printHit(label: string, hit: RetrievalHit): void {
  console.log(`${label}.documentId : ${hit.documentId}`);
  console.log(`${label}.scopeKey   : ${hit.scopeKey}`);
  console.log(`${label}.score      : ${hit.score.toFixed(6)}`);
}

interface ManualIngestInput {
  readonly documentId: string;
  readonly scopeKey: string;
  readonly pdfBytes: Uint8Array;
}

interface ManualIngestResult {
  readonly chunkCount: number;
  readonly pageCount: number;
  readonly extractorVersion: string;
  readonly embeddingModel: string;
}

/**
 * The same four real stages `IngestionService.ingest()` runs — parse, chunk,
 * embed, store — called directly so `DEMO_CHUNK_OPTIONS` can be threaded
 * through (`ingest()` does not accept `ChunkOptions`). This is NOT a
 * reimplementation of the pipeline's logic: every call below invokes the
 * actual production function. What it skips is `ingest()`'s own
 * validation wrapper (empty scope / empty document guards) — see this
 * file's header comment.
 */
async function ingestManually(
  gateway: ReturnType<typeof createModelGateway>,
  vectorStore: ReturnType<typeof createInMemoryVectorStore>,
  input: ManualIngestInput,
): Promise<ManualIngestResult> {
  const extraction = await extractPdfText(input.pdfBytes);
  const chunks = chunkDocument(input.documentId, extraction.text, DEMO_CHUNK_OPTIONS);

  const embedResponse = await gateway.embed(
    { input: chunks.map((chunk) => chunk.text) },
    `w1-00-demo-ingest:${input.documentId}`,
  );

  const records: VectorRecord[] = chunks.map((chunk, index) => ({
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    text: chunk.text,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
    scopeKey: input.scopeKey,
    embedding: Float32Array.from(embedResponse.data[index]!.embedding),
  }));
  await vectorStore.upsert(records);

  return {
    chunkCount: chunks.length,
    pageCount: extraction.pageCount,
    extractorVersion: extraction.extractorVersion,
    embeddingModel: embedResponse.model,
  };
}

async function main(): Promise<void> {
  let failed = false;

  console.log(RULE);
  console.log("W1-00 demo — one real PDF, the real pipeline, a verifiable citation offset");
  console.log("Fake providers only (deterministic embedding, in-memory store). No model required.");
  console.log(RULE);

  const embedding = createDeterministicEmbeddingProvider();
  const modelGateway = createModelGateway({ embedding, generation: UNUSED_GENERATION_PROVIDER });
  const vectorStore = createInMemoryVectorStore();

  // ---- Independent extraction: the ONLY copy of "the original text" this
  // script trusts for the citation check below. It is read and parsed here,
  // before anything is ingested, and never touched again.
  section("STEP 0 — Independently extract the fixture PDF (this is the ground truth below)");
  const independentExtraction = await extractPdfText(loadFixtureBytes());
  const originalText = independentExtraction.text;
  console.log(`extractorVersion : ${independentExtraction.extractorVersion}`);
  console.log(`pageCount        : ${independentExtraction.pageCount}`);
  console.log(`text length      : ${originalText.length} chars`);

  section("STEP 1 — Assemble the pipeline by hand (extract -> chunk -> embed -> store), scope=dept:eng");
  console.log(
    `chunkDocument() options: targetSize=${DEMO_CHUNK_OPTIONS.targetSize}, overlap=${DEMO_CHUNK_OPTIONS.overlap}` +
      " (small on purpose so this 186-char fixture yields several paragraph-sized chunks, not one).",
  );
  const docA = await ingestManually(modelGateway, vectorStore, {
    documentId: "w1-00-demo-eng",
    scopeKey: "dept:eng",
    pdfBytes: loadFixtureBytes(), // separate read — see loadFixtureBytes() doc.
  });
  console.log(`documentId       : w1-00-demo-eng`);
  console.log(`scopeKey         : dept:eng`);
  console.log(`chunkCount       : ${docA.chunkCount}`);
  console.log(`pageCount        : ${docA.pageCount}`);
  console.log(`extractorVersion : ${docA.extractorVersion}`);
  console.log(`embeddingModel   : ${docA.embeddingModel}`);

  section("STEP 2 — Ingest the SAME PDF again under a different scope (dept:hr)");
  console.log("Same bytes, same text, same chunk options — the only thing that differs is scopeKey.");
  console.log("This is what STEP 5 uses to show the scope filter actually runs, not just asserted.");
  const docB = await ingestManually(modelGateway, vectorStore, {
    documentId: "w1-00-demo-hr",
    scopeKey: "dept:hr",
    pdfBytes: loadFixtureBytes(), // separate read again.
  });
  console.log(`documentId       : w1-00-demo-hr`);
  console.log(`scopeKey         : dept:hr`);
  console.log(`chunkCount       : ${docB.chunkCount}`);

  // ---- Scope built DIRECTLY via toRetrievalScope() — not derived from
  // anything (E04-S009 is blocked-team-b; no interim mapping table here).
  const question = "文件擷取管線包含幾個階段？";
  const scopeEng = toRetrievalScope({ principalId: "demo-user", allowedScopeKeys: ["dept:eng"] });

  section("STEP 3 — Ask a real Chinese question whose answer sits in ONE paragraph, not the whole doc");
  console.log(`question : ${question}`);
  console.log(`scope    : principalId=demo-user allowedScopeKeys=[dept:eng]`);

  const queryEmbedResponse = await modelGateway.embed({ input: [question] }, "w1-00-demo-query");
  const queryEmbedding = Float32Array.from(queryEmbedResponse.data[0]!.embedding);

  const hitsEng = await vectorStore.query(queryEmbedding, scopeEng, 10);
  if (hitsEng.length === 0) {
    console.error("\nFAIL: no hits returned for scope dept:eng — nothing to demonstrate.");
    process.exit(1);
  }
  const topHit = hitsEng[0]!;

  section("STEP 4 — THE CITATION CHECK (this is the whole point of the script)");
  console.log(`question asked      : ${question}`);
  console.log(`scopeKey of top hit : ${topHit.scopeKey}`);
  console.log(`hit.text            : ${JSON.stringify(topHit.text)}`);
  console.log(`startOffset         : ${topHit.startOffset}`);
  console.log(`endOffset           : ${topHit.endOffset}`);

  // THE independent check. This slice is cut from `originalText` — the
  // separate extraction performed in STEP 0 — not from `topHit` and not from
  // anything the ingestion pipeline touched. If the offsets are wrong, this
  // will not match `topHit.text` even though both nominally describe "the
  // same chunk".
  const independentSlice = originalText.slice(topHit.startOffset, topHit.endOffset);
  console.log(`independent slice   : ${JSON.stringify(independentSlice)}`);

  const identical = independentSlice === topHit.text;
  console.log(
    `\nindependent slice === hit.text ?  ${identical ? "YES — citation offset verified" : "NO — MISMATCH"}`,
  );

  if (!identical) {
    console.error("\nFAIL: the citation offset does NOT point back into the independently-extracted text.");
    console.error("This is exactly the failure mode W1-00 exists to catch.");
    failed = true;
  }

  console.log(
    "\n[where the citation sits inside the WHOLE document — ⟦...⟧ marks exactly what the offsets\n" +
      " select; everything outside the brackets is printed only so you can see it is one paragraph\n" +
      " out of several, not the entire document]\n",
  );
  const before = originalText.slice(0, topHit.startOffset);
  const cited = originalText.slice(topHit.startOffset, topHit.endOffset);
  const after = originalText.slice(topHit.endOffset);
  console.log(`${before}⟦${cited}⟧${after}`);

  section("STEP 5 — Scope filter check: does dept:eng's query leak dept:hr's document?");
  console.log(`hits returned for scope dept:eng : ${hitsEng.length}`);
  for (const [i, hit] of hitsEng.entries()) printHit(`hitsEng[${i}]`, hit);
  const leaked = hitsEng.some((hit) => hit.scopeKey !== "dept:eng" || hit.documentId === "w1-00-demo-hr");
  console.log(`\nany hit outside dept:eng (i.e. leaking docB) ?  ${leaked ? "YES — LEAK" : "no"}`);
  if (leaked) {
    console.error("FAIL: a hit outside the requested scope leaked through. Deny-Wins is broken.");
    failed = true;
  }

  const scopeHr = toRetrievalScope({ principalId: "demo-user", allowedScopeKeys: ["dept:hr"] });
  const hitsHr = await vectorStore.query(queryEmbedding, scopeHr, 10);
  const hrNowVisible = hitsHr.some((hit) => hit.documentId === "w1-00-demo-hr");
  console.log(`\nsame question, scope changed to dept:hr instead:`);
  if (hitsHr[0]) printHit("hitsHr[0]", hitsHr[0]);
  console.log(`docB (dept:hr) now visible ?  ${hrNowVisible ? "YES" : "no"}`);
  console.log(
    "=> same question, same underlying content — only the scope changed which document answers it.",
  );
  console.log("   Authorization is enforced by the store's query path, not asserted by this script.");

  section("What this does NOT prove");
  console.log(
    "The embedding above is deterministic feature hashing (lexical/bigram overlap), not a real model.\n" +
      "This demonstrates that the pipeline plumbing is wired correctly and that citation offsets are\n" +
      "correct — it does NOT demonstrate that retrieval is semantically good. That claim needs a real\n" +
      "embedding model (PF3), and E04-S037 has not chosen one yet.\n\n" +
      "This demo also assembles the pipeline directly (extract -> chunk -> embed -> store) with a small\n" +
      "targetSize so this short fixture yields multiple chunks, instead of calling\n" +
      "`IngestionService.ingest()` end to end — `ingest()` does not expose chunk-size options, and this\n" +
      "demo does not extend that interface to get one. The integrated `ingest()` path (default chunk\n" +
      "size, plus its validation for empty scope / empty document) is exercised by\n" +
      "services/ingestion/src/pipeline.test.ts's W1-00 test, not by this script.",
  );

  console.log(`\n${RULE}`);
  console.log(failed ? "W1-00 DEMO: FAILED" : "W1-00 DEMO: PASSED");
  console.log(RULE);

  if (failed) process.exit(1);
}

main().catch((error: unknown) => {
  console.error("\nW1-00 demo crashed:", error);
  process.exit(1);
});
