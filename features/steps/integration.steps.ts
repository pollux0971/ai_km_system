/**
 * 整合點步驟(docs/integration/*.feature)。
 *
 * I1 的步驟走 in-process 管線,與 services/ingestion/src/pipeline.test.ts 的
 * W1-00 測試**同一個入口**:`createIngestionService` → `ingest()`;查詢用
 * `toRetrievalScope` + `modelGateway.embed()` + `vectorStore.query()`。這裡
 * 不做任何 mock;唯一的假東西是 PF1 的 deterministic embedding provider,
 * 那是 I1 的定義(見 feature 檔頭)。
 */
import { Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import type { KmWorld } from "./_world.js";

import { createModelGateway, type ModelGateway } from "../../services/model-gateway/src/gateway.js";
import { createDeterministicEmbeddingProvider } from "../../services/model-gateway/src/embedding/deterministic.provider.js";
import type { GenerationProvider } from "../../services/model-gateway/src/generation/provider.js";
import { createInMemoryVectorStore, type RetrievalHit, type VectorStore } from "../../services/retrieval/src/vector/store.js";
import { toRetrievalScope } from "../../services/retrieval/src/authorization/scope.js";
import { extractPdfText } from "../../services/ingestion/src/extraction/pdf-extract.js";
import { createIngestionService, type IngestionService } from "../../services/ingestion/src/service.js";

const FIXTURE_PDF = "services/ingestion/src/extraction/fixtures/cjk-non-embedded.pdf";

interface I1State {
  modelGateway: ModelGateway;
  vectorStore: VectorStore;
  ingestion: IngestionService;
  /** documentId → 獨立抽取的原文(ground truth) */
  originals: Map<string, string>;
  hits?: RetrievalHit[];
}

function state(world: KmWorld): I1State {
  const s = world.bag["i1"] as I1State | undefined;
  assert.ok(s, "Background 尚未建立 model gateway 與 vector store");
  return s;
}

function generationProviderThatRecords(world: KmWorld): GenerationProvider {
  return {
    name: "fake",
    model: "i1-embedding-only",
    fidelityCeiling: "PF1",
    async generate(): Promise<never> {
      world.providerCalls.push({ component: "generation", detail: "generate() called during I1" });
      throw new Error("I1 只用 embedding,generate() 不應被呼叫。");
    },
  };
}

// ---------------------------------------------------------------- Given

Given("the model gateway uses the deterministic embedding provider", function (this: KmWorld) {
  const embedding = createDeterministicEmbeddingProvider();
  const modelGateway = createModelGateway({ embedding, generation: generationProviderThatRecords(this) });
  this.bag["i1"] = { modelGateway, originals: new Map() } as Partial<I1State>;
});

Given("an in-memory vector store", function (this: KmWorld) {
  const partial = this.bag["i1"] as Partial<I1State> | undefined;
  assert.ok(partial?.modelGateway, "要先有 model gateway");
  const vectorStore = createInMemoryVectorStore();
  const ingestion = createIngestionService({ modelGateway: partial.modelGateway, vectorStore });
  this.bag["i1"] = { ...partial, vectorStore, ingestion, originals: partial.originals ?? new Map() };
});

async function ingestFixture(world: KmWorld, documentId: string, scopeKey: string): Promise<void> {
  const s = state(world);
  // 兩次獨立讀取:pdfjs 的 worker transport 會 detach 傳入的 buffer(見 pipeline.test.ts)。
  const { text } = await extractPdfText(world.readRepoBytes(FIXTURE_PDF));
  s.originals.set(documentId, text);
  await s.ingestion.ingest({ documentId, scopeKey, pdfBytes: world.readRepoBytes(FIXTURE_PDF) });
}

Given("the real Chinese fixture PDF is ingested under department {string}", { timeout: 60_000 }, async function (this: KmWorld, dept: string) {
  await ingestFixture(this, `i1-doc-${dept}`, `dept:${dept}`);
});

Given("the same PDF is ingested again under department {string}", { timeout: 60_000 }, async function (this: KmWorld, dept: string) {
  await ingestFixture(this, `i1-doc-${dept}`, `dept:${dept}`);
});

// ---------------------------------------------------------------- When

async function ask(world: KmWorld, question: string, allowedScopeKeys: readonly string[]): Promise<void> {
  const s = state(world);
  const scope = toRetrievalScope({ principalId: "i1-person", allowedScopeKeys, deniedScopeKeys: [] });
  const embed = await s.modelGateway.embed({ input: [question] }, "i1-query");
  const queryVector = Float32Array.from(embed.data[0]!.embedding);
  s.hits = [...(await s.vectorStore.query(queryVector, scope, 10))];
  world.lastResult = s.hits;
}

When("a person in department {string} asks {string}", { timeout: 30_000 }, async function (this: KmWorld, dept: string, question: string) {
  await ask(this, question, [`dept:${dept}`]);
});

When("a person with no department asks {string}", { timeout: 30_000 }, async function (this: KmWorld, question: string) {
  await ask(this, question, []);
});

When("the real Chinese fixture PDF is ingested with an empty department", { timeout: 60_000 }, async function (this: KmWorld) {
  const s = state(this);
  try {
    await s.ingestion.ingest({ documentId: "i1-doc-noscope", scopeKey: "", pdfBytes: this.readRepoBytes(FIXTURE_PDF) });
  } catch (error) {
    this.lastError = error as Error;
  }
});

// ---------------------------------------------------------------- Then

function topHit(world: KmWorld): RetrievalHit {
  const s = state(world);
  assert.ok(s.hits && s.hits.length > 0, "沒有任何檢索結果");
  return s.hits[0]!;
}

Then("the top hit's text equals the original text sliced by its offsets", function (this: KmWorld) {
  const hit = topHit(this);
  const original = state(this).originals.get(hit.documentId);
  assert.ok(original, `找不到 ${hit.documentId} 的獨立抽取原文`);
  const sliced = original.slice(hit.startOffset, hit.endOffset);
  assert.equal(sliced, hit.text, `offsets ${hit.startOffset}–${hit.endOffset} 切出的原文與引用文字不同`);
});

Then("the top hit's score is greater than 0", function (this: KmWorld) {
  const hit = topHit(this);
  assert.ok(hit.score > 0, `top hit 的分數應 > 0,實際 ${hit.score}(零向量或跳過 embed 會落在這裡)`);
});

Then("the top hit belongs to department {string}", function (this: KmWorld, dept: string) {
  assert.equal(topHit(this).scopeKey, `dept:${dept}`);
});

Then("every hit belongs to department {string}", function (this: KmWorld, dept: string) {
  const s = state(this);
  assert.ok(s.hits && s.hits.length > 0, "沒有任何檢索結果");
  for (const hit of s.hits) assert.equal(hit.scopeKey, `dept:${dept}`, `hit ${hit.chunkId} 的 scope 是 ${hit.scopeKey}`);
});

Then("no hit belongs to department {string}", function (this: KmWorld, dept: string) {
  const s = state(this);
  const leaked = (s.hits ?? []).filter((h) => h.scopeKey === `dept:${dept}`);
  assert.deepEqual(leaked.map((h) => h.chunkId), [], `洩漏了 dept:${dept} 的 chunk`);
});

Then("no hit is returned at all", function (this: KmWorld) {
  const s = state(this);
  assert.deepEqual((s.hits ?? []).map((h) => h.chunkId), [], "空授權範圍應該一筆都拿不到");
});

Then("the vector store is still empty", async function (this: KmWorld) {
  assert.equal(await state(this).vectorStore.count(), 0);
});
