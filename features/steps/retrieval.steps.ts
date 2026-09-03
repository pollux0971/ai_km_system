/**
 * 06-retrieval phase-1 步驟(回填)。
 *
 * 每一步呼叫的入口都是 services/retrieval 自己的 vitest 測試在呼叫的那個:
 * `createInMemoryVectorStore` + `createRetrievalService` + `retrievalPlugin`
 * (plugin.test.ts AC-RS1/RS3)、`retrieve()`(service.test.ts AC-R1～R4)、
 * `retrieveWithReranking()`(retrieve-with-reranking.test.ts)、
 * `EmbeddingVersionMismatchError`(embedding-identity.test.ts)。這裡不 mock 任何接縫。
 */
import { Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import Fastify from "fastify";
import type { KmWorld } from "./_world.js";

import { retrievalPlugin } from "../../services/retrieval/src/plugin.js";
import {
  createModelGatewayEmbeddingProvider,
  createRetrievalService,
  type RetrievalService,
} from "../../services/retrieval/src/service.js";
import { createInMemoryVectorStore, type RetrievalHit, type VectorRecord, type VectorStore } from "../../services/retrieval/src/vector/store.js";
import type { EmbeddingProvider } from "../../services/retrieval/src/embedding/provider.js";
import { toRetrievalScope, type RetrievalScope } from "../../services/retrieval/src/authorization/scope.js";
import { retrieveWithReranking } from "../../services/retrieval/src/rerank/retrieve-with-reranking.js";

const MAINTENANCE_TEXT = "軸承過熱應先停機並記錄運轉時數";
const ENG_TEXT = "馬達運轉溫度超過八十度時應檢查冷卻風扇";
/** 原始文件全文:chunk 的 offsets 指向這裡,不是指向 chunk 自己 */
const MAINTENANCE_DOC = `維修手冊第三章。${MAINTENANCE_TEXT}。若持續過熱應更換潤滑油。`;
const ENG_DOC = `工程規範。${ENG_TEXT}。`;

interface RetrievalState {
  store: VectorStore;
  embedding: EmbeddingProvider;
  service: RetrievalService;
  /** documentId → 原始文件全文 */
  docs: Map<string, string>;
  hits?: readonly RetrievalHit[];
  /** 額外 seed 的候選 chunkId(rerank 場景用) */
  candidates: Set<string>;
}

function state(world: KmWorld): RetrievalState {
  const s = world.bag["retrieval"] as RetrievalState | undefined;
  assert.ok(s, "Background 尚未 seed 檢索 store");
  return s;
}

function scopeFor(dept: string): RetrievalScope {
  return toRetrievalScope({ principalId: `person-${dept || "none"}`, allowedScopeKeys: dept ? [`dept:${dept}`] : [] });
}

async function seed(store: VectorStore, embedding: EmbeddingProvider, docs: Map<string, string>, rows: { chunkId: string; documentId: string; text: string; doc: string; scopeKey: string }[], identity?: { model: string; dimensions: number }): Promise<void> {
  const vectors = await embedding.embed(rows.map((r) => r.text));
  const records: VectorRecord[] = rows.map((r, i) => {
    docs.set(r.documentId, r.doc);
    const start = r.doc.indexOf(r.text);
    assert.ok(start >= 0, `seed 文字必須出現在原始文件裡:${r.text}`);
    return {
      chunkId: r.chunkId,
      documentId: r.documentId,
      text: r.text,
      startOffset: start,
      endOffset: start + r.text.length,
      scopeKey: r.scopeKey,
      embedding: vectors[i]!,
      ...(identity ? { embeddingModel: identity.model, embeddingDimensions: identity.dimensions } : {}),
    };
  });
  await store.upsert(records);
}

// ---------------------------------------------------------------- Given

Given("a retrieval store seeded with one maintenance chunk and one engineering chunk", async function (this: KmWorld) {
  const store = createInMemoryVectorStore();
  const embedding = createModelGatewayEmbeddingProvider();
  const docs = new Map<string, string>();
  await seed(store, embedding, docs, [
    { chunkId: "doc-maintenance-001#0", documentId: "doc-maintenance-001", text: MAINTENANCE_TEXT, doc: MAINTENANCE_DOC, scopeKey: "dept:maintenance" },
    { chunkId: "doc-eng-001#0", documentId: "doc-eng-001", text: ENG_TEXT, doc: ENG_DOC, scopeKey: "dept:eng" },
  ]);
  const service = createRetrievalService({ store, embedding, enforceEmbeddingVersion: false });
  this.bag["retrieval"] = { store, embedding, service, docs, candidates: new Set(["doc-maintenance-001#0", "doc-eng-001#0"]) } satisfies RetrievalState;
});

Given("the store's scope filter is switched off", function (this: KmWorld) {
  const s = state(this);
  // 與 service.test.ts AC-R3 同一種破壞:store 忽略傳入的 scope,用一個放行所有部門的 scope 查。
  const everything = toRetrievalScope({ principalId: "leaky-store", allowedScopeKeys: ["dept:maintenance", "dept:eng"] });
  const leaky: VectorStore = { ...s.store, query: (vector, _scope, topK, expected) => s.store.query(vector, everything, topK, expected) };
  s.service = createRetrievalService({ store: leaky, embedding: s.embedding, enforceEmbeddingVersion: false });
});

Given("the seeded chunks were indexed under embedding identity {string}", async function (this: KmWorld, model: string) {
  const s = state(this);
  const store = createInMemoryVectorStore();
  const docs = new Map<string, string>();
  await seed(store, s.embedding, docs, [
    { chunkId: "doc-maintenance-001#0", documentId: "doc-maintenance-001", text: MAINTENANCE_TEXT, doc: MAINTENANCE_DOC, scopeKey: "dept:maintenance" },
  ], { model, dimensions: s.embedding.dimensions });
  s.store = store;
  s.docs = docs;
});

Given("the store also holds three near-duplicate engineering chunks and one different engineering chunk", async function (this: KmWorld) {
  const s = state(this);
  const dupBase = "軸承過熱應先停機並記錄運轉時數並通知值班工程師";
  const rows = [1, 2, 3].map((n) => ({
    chunkId: `doc-eng-dup#${n}`,
    documentId: "doc-eng-dup",
    text: `${dupBase}(副本${n})`,
    doc: `重複段落集。${dupBase}(副本1)。${dupBase}(副本2)。${dupBase}(副本3)。`,
    scopeKey: "dept:eng",
  }));
  rows.push({
    chunkId: "doc-eng-other#0",
    documentId: "doc-eng-other",
    text: "軸承過熱時的潤滑油更換週期與品牌選擇",
    doc: "潤滑指引。軸承過熱時的潤滑油更換週期與品牌選擇。",
    scopeKey: "dept:eng",
  });
  await seed(s.store, s.embedding, s.docs, rows);
  for (const r of rows) s.candidates.add(r.chunkId);
});

// ---------------------------------------------------------------- When

async function ask(world: KmWorld, dept: string, question: string, fn: (svc: RetrievalService, scope: RetrievalScope) => Promise<readonly RetrievalHit[]>): Promise<void> {
  const s = state(world);
  try {
    s.hits = await fn(s.service, scopeFor(dept));
    world.lastResult = s.hits;
  } catch (error) {
    world.lastError = error as Error;
    s.hits = undefined;
  }
}

When("the retrieval plugin is registered on a fresh server and the server becomes ready", async function (this: KmWorld) {
  const s = state(this);
  const instance = Fastify({ logger: false });
  await instance.register(retrievalPlugin, { service: s.service });
  await instance.ready();
  this.bag["retrievalApp"] = instance;
});

When("a maintenance person asks {string}", async function (this: KmWorld, question: string) {
  await ask(this, "maintenance", question, (svc, scope) => svc.retrieve(question, scope, 3));
});

When("a finance person asks {string}", async function (this: KmWorld, question: string) {
  await ask(this, "finance", question, (svc, scope) => svc.retrieve(question, scope, 3));
});

When("a person with an empty scope asks {string}", async function (this: KmWorld, question: string) {
  await ask(this, "", question, (svc, scope) => svc.retrieve(question, scope, 3));
});

When("a maintenance person asks {string} with the version guard on and a provider whose identity is {string}", async function (this: KmWorld, question: string, model: string) {
  const s = state(this);
  const base = s.embedding;
  const other: EmbeddingProvider = { ...base, componentId: `embedding:${model}`, model, embed: (texts) => base.embed(texts) } as EmbeddingProvider;
  s.service = createRetrievalService({ store: s.store, embedding: other, enforceEmbeddingVersion: true });
  await ask(this, "maintenance", question, (svc, scope) => svc.retrieve(question, scope, 3));
});

When("an engineering person asks {string} with reranking for the top {int}", async function (this: KmWorld, question: string, topK: number) {
  await ask(this, "eng", question, (svc, scope) => retrieveWithReranking(svc, question, scope, topK));
});

// ---------------------------------------------------------------- Then

function hits(world: KmWorld): readonly RetrievalHit[] {
  const s = state(world);
  assert.ok(s.hits, `沒有檢索結果(可能被拒絕:${world.lastError?.name} ${world.lastError?.message})`);
  return s.hits;
}

Then("the retrieval seam is visible from the parent instance", function (this: KmWorld) {
  const app = this.bag["retrievalApp"] as { retrieval?: RetrievalService } | undefined;
  assert.ok(app?.retrieval, "app.retrieval 在父實例上不可見——plugin 沒用 fp() 包裝(ADR 0007 §5)");
});

Then("a maintenance person asking {string} through that seam gets exactly the maintenance chunk", async function (this: KmWorld, question: string) {
  const app = this.bag["retrievalApp"] as { retrieval: RetrievalService };
  const result = await app.retrieval.retrieve(question, scopeFor("maintenance"), 3);
  assert.deepEqual(result.map((h) => h.chunkId), ["doc-maintenance-001#0"]);
});

Then("the hits are empty", function (this: KmWorld) {
  assert.deepEqual(hits(this).map((h) => h.chunkId), []);
});

Then("the first hit's text is {string}", function (this: KmWorld, text: string) {
  assert.equal(hits(this)[0]?.text, text);
});

Then("the first hit's score is greater than 0", function (this: KmWorld) {
  const first = hits(this)[0];
  assert.ok(first && first.score > 0, `第一筆分數應 > 0,實際 ${first?.score}`);
});

Then("every hit is in department {string}", function (this: KmWorld, dept: string) {
  for (const h of hits(this)) assert.equal(h.scopeKey, `dept:${dept}`, `hit ${h.chunkId} 的 scope 是 ${h.scopeKey}`);
});

Then("the first hit's offsets slice the original document to its text", function (this: KmWorld) {
  const first = hits(this)[0];
  assert.ok(first, "沒有任何命中");
  const doc = state(this).docs.get(first.documentId);
  assert.ok(doc, `找不到 ${first.documentId} 的原始文件`);
  assert.equal(doc.slice(first.startOffset, first.endOffset), first.text, `offsets ${first.startOffset}–${first.endOffset} 沒有指向原始文件裡的那段`);
});

Then("the rejection message names both {string} and {string}", function (this: KmWorld, a: string, b: string) {
  assert.ok(this.lastError, "沒有被拒絕");
  assert.ok(this.lastError.message.includes(a), `訊息應含 ${a}:${this.lastError.message}`);
  assert.ok(this.lastError.message.includes(b), `訊息應含 ${b}:${this.lastError.message}`);
});

Then("every returned hit is one of the store's own candidates", function (this: KmWorld) {
  const s = state(this);
  for (const h of hits(this)) assert.ok(s.candidates.has(h.chunkId), `hit ${h.chunkId} 不在候選集合裡——rerank 捏造了結果`);
});

Then("the two returned hits are not near-duplicates of each other", function (this: KmWorld) {
  const result = hits(this);
  assert.equal(result.length, 2, `應回傳 2 筆,實際 ${result.length}`);
  const families = result.map((h) => h.documentId);
  assert.notEqual(families[0], families[1], `兩筆都來自 ${families[0]}——MMR 退化成純相似度排序`);
});
