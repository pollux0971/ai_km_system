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
  return toRetrievalScope({
    principalId: `person-${dept || "none"}`,
    allowedScopeKeys: dept ? [`dept:${dept}`] : [],
    deniedScopeKeys: [],
  });
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
  const everything = toRetrievalScope({
    principalId: "leaky-store",
    allowedScopeKeys: ["dept:maintenance", "dept:eng"],
    deniedScopeKeys: [],
  });
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

// ==================================================================
// phase-2(紅)—— services/retrieval 接進 apps/api 的 composition root。
// 每一步只呼叫今天已經存在的符號:KmWorld.startServer()(apps/api 真實
// buildServer())、retrievalPlugin 會裝的 app.retrieval(services/retrieval,
// 今天沒被 server.ts 註冊)、以及上面 phase-1 已經在用的 toRetrievalScope()。
// 沒有 import 任何新的實作符號,紅只會發生在斷言,不會發生在編譯。細節見
// phase-2.feature 開頭的說明與 FEATURE.md。
//
// 刻意不斷言「能不能拿到某部門的真 chunk」:retrievalPlugin 沒指定
// service/store 時預設是全新的空記憶體 store(service.ts:238),而 apps/api
// 今天沒有任何測試用的 seed 通道能把資料灌進 app.retrieval——即使 phase-2
// 正確接上 retrievalPlugin,這類斷言也不會變綠。見 phase-2.feature 開頭
// 的說明與 FEATURE.md「開放問題」。
// ==================================================================

interface CompositionRootOutcome {
  seamPresent: boolean;
  hits?: readonly RetrievalHit[];
  errorName?: string;
}

interface CompositionRootState {
  /** app.retrieval 在真實 buildServer() 父實例上是否存在(今天恆為 false) */
  seamPresent?: boolean;
  hits?: readonly RetrievalHit[];
  /** scenario 4:兩個真部門不同的人各自的結果,拿來比較是否一致 */
  outcomes?: Map<string, CompositionRootOutcome>;
}

function compositionState(world: KmWorld): CompositionRootState {
  const s = world.bag["compositionRoot"] as CompositionRootState | undefined;
  assert.ok(s, "When 尚未透過 composition root 的 retrieval seam 問過問題");
  return s;
}

async function loginDemoPerson(app: Awaited<ReturnType<KmWorld["startServer"]>>, username: string): Promise<void> {
  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { username, password: "demo-pass-123" },
  });
  assert.equal(
    login.statusCode,
    200,
    `登入 ${username} 應成功(這一步只是確認 identity/session 沒壞,缺口專在 retrieval 沒被接進來):實際 ${login.statusCode} ${login.body}`,
  );
}

async function askThroughRealSeam(
  app: Awaited<ReturnType<KmWorld["startServer"]>>,
  principalId: string,
  question: string,
): Promise<CompositionRootOutcome> {
  const seam = (app as unknown as { retrieval?: RetrievalService }).retrieval;
  const outcome: CompositionRootOutcome = { seamPresent: Boolean(seam) };
  if (seam) {
    // ADR 0014 的固定值:composition root 一旦接好,每個人都應該用同一個
    // dept:eng scope,不管這個人真正的部門是什麼。
    //
    // deniedScopeKeys 為空是 I2 的實話,不是省略:ADR 0014 的固定 scope 沒有任何
    // 明確拒絕項。deny 這條路徑由 02-authorization 的 phase-2b 場景守(它自己的
    // deny.test.ts 與 phase-2.feature),不由這裡守——這個 seam 只證明
    // composition root 接上了。真正依身分推導 allowed/denied 的那一步是 I3。
    const scope = toRetrievalScope({
      principalId,
      allowedScopeKeys: ["dept:eng"],
      deniedScopeKeys: [],
    });
    try {
      outcome.hits = await seam.retrieve(question, scope, 3);
    } catch (error) {
      outcome.errorName = (error as Error).name;
    }
  }
  return outcome;
}

// ---------------------------------------------------------------- When

When(
  "a signed-in demo person tries to ask {string} through the real API server's own retrieval seam",
  { timeout: 60_000 },
  async function (this: KmWorld, question: string) {
    const app = await this.startServer();
    await loginDemoPerson(app, "demo-user");
    const outcome = await askThroughRealSeam(app, "demo-user", question);
    this.bag["compositionRoot"] = { seamPresent: outcome.seamPresent, hits: outcome.hits } satisfies CompositionRootState;
    if (outcome.errorName) this.bag["compositionRootErrorName"] = outcome.errorName;
  },
);

When(
  "two different demo people with different real departments each try to ask {string} through the real API server's own retrieval seam",
  { timeout: 60_000 },
  async function (this: KmWorld, question: string) {
    const app = await this.startServer();
    const outcomes = new Map<string, CompositionRootOutcome>();
    // demo-user(資訊部)與 demo-maintenance(維修部)——services/identity 的 fixture,
    // 兩個人的真部門顯示名稱不同(見 services/identity/src/repository.ts)。
    for (const username of ["demo-user", "demo-maintenance"]) {
      await loginDemoPerson(app, username);
      outcomes.set(username, await askThroughRealSeam(app, username, question));
    }
    const seamPresent = [...outcomes.values()].every((o) => o.seamPresent);
    this.bag["compositionRoot"] = { seamPresent, outcomes } satisfies CompositionRootState;
  },
);

// ---------------------------------------------------------------- Then

Then(
  "the retrieval seam should be visible from the real server's parent instance, but it is not yet",
  function (this: KmWorld) {
    const s = compositionState(this);
    assert.ok(
      s.seamPresent,
      "app.retrieval 在 apps/api 真實 buildServer() 的父實例上不存在——composition root 今天完全沒有把 " +
        "services/retrieval 接進來(這一輪的產出,見 features/06-retrieval/NEXT.md phase-2)。後果:即使一個人 " +
        "真的登入成功(上一步的 200 已經證明 session 本身沒壞),07-generation 也沒有任何東西可以呼叫—— " +
        "I2「登入問問題拿到答案」在第一步就斷了。修法比照 apps/api/src/server.ts 既有的 " +
        "conversationPlugin/feedbackPlugin 條件註冊樣式,加上 retrievalPlugin 的註冊即可讓這句變綠。",
    );
  },
);

Then("the empty question should be rejected with {string}, not silently answered", function (this: KmWorld, errorName: string) {
  const errName = this.bag["compositionRootErrorName"] as string | undefined;
  assert.ok(
    errName,
    "空問題應該被 services/retrieval 既有的守門拒絕,但沒有任何錯誤被記錄下來(seam 不存在時這一步不會被執行到)",
  );
  assert.equal(errName, errorName, `錯誤類型應為 ${errorName},實際 ${errName}`);
});

Then("the hits should come back empty, never an invented citation", function (this: KmWorld) {
  const s = compositionState(this);
  assert.ok(s.hits, "還沒有任何檢索結果(seam 不存在時這一步不會被執行到)");
  assert.deepEqual(
    s.hits.map((h) => h.chunkId),
    [],
    `今天還沒有任何資料被索引(05-ingestion/phase-2 是另一個資料夾的工作),seam 應該老實回報「沒有」,` +
      `而不是命中 ${s.hits.map((h) => h.chunkId).join(", ")} 這種今天不該存在的資料——不索引不等於允許捏造`,
  );
});

Then(
  "both people should get the exact same outcome from the seam, because I2's scope is fixed for everyone alike, not derived from either person's real department",
  function (this: KmWorld) {
    const s = compositionState(this);
    assert.ok(s.outcomes, "還沒有任何兩個人的比較結果");
    const a = s.outcomes.get("demo-user");
    const b = s.outcomes.get("demo-maintenance");
    assert.ok(a && b, "應該有 demo-user 與 demo-maintenance 兩個人的結果可以比較");
    assert.deepEqual(
      { hits: a.hits?.map((h) => h.chunkId) ?? null, error: a.errorName ?? null },
      { hits: b.hits?.map((h) => h.chunkId) ?? null, error: b.errorName ?? null },
      `demo-user(真部門「資訊部」)與 demo-maintenance(真部門「維修部」)透過同一個 seam 問同一個問題,` +
        `結果卻不一樣——ADR 0014 的固定值 dept:eng 應該讓每個人在 I2 期間得到完全相同的待遇,不管真部門是什麼。` +
        `等 02-authorization phase-2(從身分推導真 scope)真的落地、composition root 把這個固定值換掉之後,` +
        `不同部門的人理當開始得到不同的結果——這條「應該相同」的斷言屆時理應跟著紅,那正是這個場景故意設計成` +
        `的移除條件(ADR 0014 Consequences)。看到它紅,代表有人動了固定值,該做的是照 ` +
        `02-authorization/phase-1.feature 的 @design-constraint 場景先例,把這條場景改寫成新的事實,不是刪掉` +
        `或放寬斷言。`,
    );
  },
);
