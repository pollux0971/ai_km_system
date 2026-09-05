/**
 * 整合點步驟(docs/integration/*.feature)。
 *
 * I1 的步驟走 in-process 管線,與 services/ingestion/src/pipeline.test.ts 的
 * W1-00 測試**同一個入口**:`createIngestionService` → `ingest()`;查詢用
 * `toRetrievalScope` + `modelGateway.embed()` + `vectorStore.query()`。這裡
 * 不做任何 mock;唯一的假東西是 PF1 的 deterministic embedding provider,
 * 那是 I1 的定義(見 feature 檔頭)。
 *
 * I2(`docs/integration/i2-ask-in-web.feature`)的步驟走真實 `apps/api`
 * composition root(`KmWorld.startServer()` → `buildServer()`),與
 * `features/steps/conversation.steps.ts` 的 03-conversation/phase-2 同一個
 * 入口——真的 session cookie 登入、真的 `POST .../messages` 觸發
 * `app.rag.ask()`(`apps/api/src/rag-plugin.ts`)。這裡不 import 別的能力
 * 資料夾的 steps 檔(NEXT.md 的角色守門),只 import 它們也在 import 的
 * service 模組。I1/I2 兩段共用同一句 Given/When 文字時(見下方「the real
 * Chinese fixture PDF is ingested under department」與「a person in
 * department {string} asks {string}」),用 `this.tags` 是否含 `@i2` 分流,
 * 不是重複定義。
 */
import { After, Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import type { KmWorld } from "./_world.js";

import { createModelGateway, type ModelGateway } from "../../services/model-gateway/src/gateway.js";
import { createDeterministicEmbeddingProvider } from "../../services/model-gateway/src/embedding/deterministic.provider.js";
import type { GenerationProvider } from "../../services/model-gateway/src/generation/provider.js";
import { createInMemoryVectorStore, type RetrievalHit, type VectorStore } from "../../services/retrieval/src/vector/store.js";
import { toRetrievalScope, type RetrievalScope } from "../../services/retrieval/src/authorization/scope.js";
import { extractPdfText } from "../../services/ingestion/src/extraction/pdf-extract.js";
import { chunkDocument } from "../../services/ingestion/src/chunking/chunk.js";
import { createIngestionService, type IngestionService } from "../../services/ingestion/src/service.js";
import { hostDb } from "../../services/conversation/src/plugin-types.js";
import { SESSION_COOKIE_NAME } from "../../services/identity/src/require-session.js";

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

Given(
  "the real Chinese fixture PDF is ingested under department {string}",
  { timeout: 60_000 },
  async function (this: KmWorld, dept: string) {
    // I2 的 Background 沒有先跑「the model gateway uses the deterministic
    // embedding provider」/「an in-memory vector store」(那兩句是 I1 自己的
    // Background),所以這裡不能用 I1 的 state() ——用 `@i2` 這個 feature 級
    // tag 分流到真實 server 那條路(見檔頭註解)。
    if (this.tags.includes("@i2")) {
      await ingestFixtureIntoRealServer(this, dept);
      return;
    }
    await ingestFixture(this, `i1-doc-${dept}`, `dept:${dept}`);
  },
);

Given("the same PDF is ingested again under department {string}", { timeout: 60_000 }, async function (this: KmWorld, dept: string) {
  await ingestFixture(this, `i1-doc-${dept}`, `dept:${dept}`);
});

// ================================================================== I2
//
// 真實 server(apps/api buildServer())上的狀態。`app.ingestion`/
// `app.retrieval` 共用同一個 store(ADR 0015),`app.rag.ask()`
// (apps/api/src/rag-plugin.ts)把兩者串起來、再交給 `app.generation.answer()`。

interface I2Person {
  readonly username: string;
  readonly cookie: string;
  conversationId?: string;
}

interface I2SseWindow {
  readonly statusCode: number;
  buffer(): string;
  close(): void;
}

interface I2State {
  app: FastifyInstance;
  /** documentId → 獨立抽取的原文(ground truth)——引用切片檢查與 I1 regression 共用 */
  originals: Map<string, string>;
  /** documentId → ingest 時給的部門字串("eng"/"hr"),給引用洩漏檢查對照用 */
  documentDept: Map<string, string>;
  people: Map<string, I2Person>;
  /** @regression「I1 still holds」場景專用:直接呼叫 app.retrieval 查出的 hits */
  hits?: RetrievalHit[];
  /** 最近一次「demo user posts the question ... to a new conversation」的 assistant 回覆本體 */
  lastAssistantMessage?: Record<string, unknown>;
  /** @regression SSE 場景專用 */
  sseWindow?: I2SseWindow;
  lastRegressionMessageId?: string;
}

function i2State(world: KmWorld): I2State {
  const s = world.bag["i2"] as I2State | undefined;
  assert.ok(s, "Background 尚未起一個真實 server(a fresh server with fake providers)");
  return s;
}

/** 惰性初始化,讀寫 `world.bag["i2"]`。`world.startServer()` 在 Background 已經
 * 呼叫過一次時直接回傳快取的 `this.app`,這裡再呼叫一次不會建出第二個 server。 */
async function ensureI2State(world: KmWorld): Promise<I2State> {
  let s = world.bag["i2"] as I2State | undefined;
  if (!s) {
    const app = await world.startServer();
    s = { app, originals: new Map(), documentDept: new Map(), people: new Map() };
    world.bag["i2"] = s;
  }
  return s;
}

/** 把真的中文 fixture PDF 索引進真實 server 共用的那個 store(ADR 0015)。 */
async function ingestFixtureIntoRealServer(world: KmWorld, dept: string): Promise<void> {
  const s = await ensureI2State(world);
  const documentId = `i2-doc-${dept}`;
  // 兩次獨立讀取:pdfjs 的 worker transport 會 detach 傳入的 buffer(見 ingestFixture 同樣理由)。
  const { text } = await extractPdfText(world.readRepoBytes(FIXTURE_PDF));
  s.originals.set(documentId, text);
  s.documentDept.set(documentId, dept);
  const seam = (
    s.app as unknown as {
      ingestion?: {
        ingest(input: { documentId: string; scopeKey: string; pdfBytes: Uint8Array }): Promise<unknown>;
      };
    }
  ).ingestion;
  assert.ok(seam, "app.ingestion 在真實 buildServer() 上不存在(05-ingestion/phase-2 應該已經接上,ADR 0015)");
  await seam.ingest({ documentId, scopeKey: `dept:${dept}`, pdfBytes: world.readRepoBytes(FIXTURE_PDF) });
}

const I2_DEMO_USERNAME = "demo-user";
const I2_DEMO_PASSWORD = "demo-pass-123";

Given(
  "the demo user belongs to department {string}",
  { timeout: 30_000 },
  async function (this: KmWorld, dept: string) {
    const s = await ensureI2State(this);
    const db = hostDb(s.app);
    // 誠實記錄(見本檔末尾給協調者的發現):這一步只把「demo-user 屬於哪個
    // 部門」寫進 identity 的 `users.department` 欄位本身——它不會、也從來
    // 不會改變 app.rag.ask() 實際用的授權範圍。ADR 0014 的 fixed scope 對
    // 每一個呼叫者都固定回傳 allowedScopeKeys: ["dept:eng"],完全不看
    // caller 的部門(apps/api/src/rag-plugin.ts 的 buildI2FixedScope;
    // 03-conversation/phase-2.feature 自己也有一句「both should still
    // carry the exact same fixed "dept:eng" permission, because I2 has
    // not changed that yet」)。這句 Given 因此只能讓場景描述的前提在資料
    // 上成立,不能讓「換部門的人看不到」這件事在系統裡真的發生。
    const result = db.prepare("UPDATE users SET department = ? WHERE username = ?").run(dept, I2_DEMO_USERNAME);
    assert.equal(
      result.changes,
      1,
      `demo-user 這個帳號應該已經被 identity 的 seedDemoUsers 種進 users 表,實際 UPDATE 影響 ${result.changes} 列`,
    );
  },
);

async function loginI2DemoUser(world: KmWorld): Promise<I2Person> {
  const s = await ensureI2State(world);
  let person = s.people.get(I2_DEMO_USERNAME);
  if (person) return person;
  const res = await s.app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { username: I2_DEMO_USERNAME, password: I2_DEMO_PASSWORD },
  });
  assert.equal(res.statusCode, 200, `demo-user 登入應成功,實際 ${res.statusCode} ${res.body}`);
  const raw = res.headers["set-cookie"];
  const header = Array.isArray(raw) ? raw.join("\n") : String(raw ?? "");
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(header);
  assert.ok(match?.[1], `demo-user 登入沒有帶 ${SESSION_COOKIE_NAME} cookie:${header || "(沒有 Set-Cookie)"}`);
  person = { username: I2_DEMO_USERNAME, cookie: match[1] as string };
  s.people.set(I2_DEMO_USERNAME, person);
  return person;
}

// ---------------------------------------------------------------- When

async function ask(world: KmWorld, question: string, allowedScopeKeys: readonly string[]): Promise<void> {
  const s = state(world);
  const scope = toRetrievalScope({ principalId: "i1-person", allowedScopeKeys, deniedScopeKeys: [] });
  const embed = await s.modelGateway.embed({ input: [question] }, "i1-query");
  const queryVector = Float32Array.from(embed.data[0]!.embedding);
  s.hits = [...(await s.vectorStore.query(queryVector, scope, 10))];
  world.lastResult = s.hits;
}

/** I2 的「@regression I1 still holds」場景專用:直接呼叫真實 server 的
 * app.retrieval(不經 app.rag/app.generation),驗證 06-retrieval/phase-2 接上
 * 之後,I1 的 offsets 性質在真實 server 上仍然成立。 */
async function askViaRealRetrieval(world: KmWorld, question: string, allowedScopeKeys: readonly string[]): Promise<void> {
  const s = await ensureI2State(world);
  const retrieval = (
    s.app as unknown as {
      retrieval?: {
        retrieve(question: string, scope: RetrievalScope, topK?: number): Promise<readonly RetrievalHit[]>;
      };
    }
  ).retrieval;
  assert.ok(retrieval, "app.retrieval 在真實 buildServer() 上不存在(06-retrieval/phase-2 應該已經接上)");
  const scope = toRetrievalScope({ principalId: "i2-regression-person", allowedScopeKeys, deniedScopeKeys: [] });
  s.hits = [...(await retrieval.retrieve(question, scope, 10))];
  world.lastResult = s.hits;
}

When("a person in department {string} asks {string}", { timeout: 30_000 }, async function (this: KmWorld, dept: string, question: string) {
  if (this.tags.includes("@i2")) {
    await askViaRealRetrieval(this, question, [`dept:${dept}`]);
    return;
  }
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

/** I1 與 I2 的 regression 場景共用:兩邊都只需要「hits + originals」這兩樣。 */
interface HitsOwner {
  hits?: RetrievalHit[];
  originals: Map<string, string>;
}

function hitsOwner(world: KmWorld): HitsOwner {
  const i1 = world.bag["i1"] as I1State | undefined;
  if (i1) return i1;
  const i2 = world.bag["i2"] as I2State | undefined;
  assert.ok(i2, "Background 尚未建立任何檢索狀態(既不是 I1 的 model gateway/vector store,也不是 I2 的真實 server)");
  return i2;
}

function topHit(world: KmWorld): RetrievalHit {
  const o = hitsOwner(world);
  assert.ok(o.hits && o.hits.length > 0, "沒有任何檢索結果");
  return o.hits[0]!;
}

Then("the top hit's text equals the original text sliced by its offsets", function (this: KmWorld) {
  const hit = topHit(this);
  const original = hitsOwner(this).originals.get(hit.documentId);
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

// ================================================================== I2 —— When/Then

When(
  "the demo user posts the question {string} to a new conversation",
  { timeout: 30_000 },
  async function (this: KmWorld, question: string) {
    const s = await ensureI2State(this);
    const person = await loginI2DemoUser(this);

    const createRes = await s.app.inject({
      method: "POST",
      url: "/v1/conversations",
      headers: { "x-requested-with": "XMLHttpRequest" },
      cookies: { [SESSION_COOKIE_NAME]: person.cookie },
      payload: {},
    });
    assert.equal(createRes.statusCode, 201, `建立對話應為 201,實際 ${createRes.statusCode}:${createRes.body}`);
    person.conversationId = (createRes.json() as { id: string }).id;

    const messageRes = await s.app.inject({
      method: "POST",
      url: `/v1/conversations/${person.conversationId}/messages`,
      headers: { "x-requested-with": "XMLHttpRequest" },
      cookies: { [SESSION_COOKIE_NAME]: person.cookie },
      payload: { role: "user", content: question },
    });
    // 共用的「the response status is {int}」(common.steps.ts)讀 this.lastResponse。
    this.lastResponse = messageRes;

    // triggerRagReply() 在 POST .../messages 這個 request handler 裡是同步
    // await 完才回應(routes/messages.ts 的設計判斷 A),所以這裡不用像
    // conversation.steps.ts 的 waitForAssistantReply() 那樣輪詢——訊息列表
    // 現在讀到的就是最終狀態。
    const listRes = await s.app.inject({
      method: "GET",
      url: `/v1/conversations/${person.conversationId}/messages`,
      cookies: { [SESSION_COOKIE_NAME]: person.cookie },
    });
    assert.equal(listRes.statusCode, 200, `讀取訊息列表應為 200,實際 ${listRes.statusCode}:${listRes.body}`);
    const messages = listRes.json() as Record<string, unknown>[];
    s.lastAssistantMessage = messages.filter((m) => m["role"] === "assistant").at(-1);
  },
);

interface CitationLike {
  readonly chunkId: string;
  readonly documentId: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

function lastAssistantMessage(world: KmWorld): Record<string, unknown> {
  const s = i2State(world);
  assert.ok(
    s.lastAssistantMessage,
    "這個對話裡沒有出現任何 assistant 訊息——app.rag 沒有被觸發,或訊息路由沒有等它完成就回應",
  );
  return s.lastAssistantMessage!;
}

function citationsOf(world: KmWorld): CitationLike[] {
  return (lastAssistantMessage(world)["citations"] as CitationLike[] | undefined) ?? [];
}

Then("the answer carries at least one citation", function (this: KmWorld) {
  const citations = citationsOf(this);
  assert.ok(citations.length > 0, `回答應該至少帶一個引用,實際 citations=${JSON.stringify(citations)}`);
});

// 斷言對著「會變的量」:引用清單裡有沒有一筆屬於這個 documentId——不是
// 「有沒有引用」(那條上面已經有了)。這兩條 i2-ask-in-web.feature 新場景
// (答非所問、跨部門固定 scope)的意義正是「今天拿得到 i2-doc-eng 這篇的
// 引用,I3/PF3 落地後同一個 documentId 應該從引用清單消失」——如果這裡只
// 斷言 citations.length > 0,I3 把 hr 使用者的引用換成別的授權範圍內文件、
// 或 PF3 加了門檻後回傳空引用改回別的存在性結果,這條斷言會誤判仍然通過。
Then("the answer carries at least one citation from document {string}", function (this: KmWorld, documentId: string) {
  const citations = citationsOf(this);
  const matching = citations.filter((c) => c.documentId === documentId);
  assert.ok(
    matching.length > 0,
    `回答應該至少帶一筆屬於文件 ${documentId} 的引用,實際 citations=${JSON.stringify(citations)}`,
  );
});

Then("every citation's text equals the original text sliced by its offsets", function (this: KmWorld) {
  const s = i2State(this);
  const citations = citationsOf(this);
  assert.ok(citations.length > 0, "沒有任何引用可以驗證 offsets(前一句 Then 應該已經斷言過至少一個)");
  for (const citation of citations) {
    const original = s.originals.get(citation.documentId);
    assert.ok(original, `找不到 ${citation.documentId} 的獨立抽取原文——這個 documentId 不是這個場景自己 ingest 的文件`);
    // 跟 conversation.steps.ts 的 phase-2 場景同一個驗法:從獨立抽取的原文
    // 重新跑一次 chunkDocument(),確認這個 citation 的 offsets 對得上一個
    // 真實 chunk 邊界(不是隨便兩個數字),而且那個邊界切出的文字逐字等於
    // 這裡再切一次算出來的結果——雙重防線,不是同義反覆。
    const expectedChunks = chunkDocument(citation.documentId, original);
    const expected = expectedChunks.find(
      (c) => c.startOffset === citation.startOffset && c.endOffset === citation.endOffset,
    );
    assert.ok(
      expected,
      `引用 ${JSON.stringify(citation)} 的 offsets 對不上任何一個從原文重新切出來的 chunk 邊界(文件 ` +
        `${citation.documentId} 重新跑 chunkDocument() 之後的邊界:` +
        `${JSON.stringify(expectedChunks.map((c) => [c.startOffset, c.endOffset]))})`,
    );
    const sliced = original.slice(citation.startOffset, citation.endOffset);
    assert.equal(
      sliced,
      expected!.text,
      `offsets ${citation.startOffset}–${citation.endOffset} 切出的是「${sliced}」,應該逐字等於原文那個 chunk 的「${expected!.text}」`,
    );
  }
});

Then("no citation belongs to a document outside department {string}", function (this: KmWorld, dept: string) {
  const s = i2State(this);
  const citations = citationsOf(this);
  const leaked = citations.filter((c) => s.documentDept.get(c.documentId) !== dept);
  assert.deepEqual(
    leaked.map((c) => ({ documentId: c.documentId, actualDept: s.documentDept.get(c.documentId) })),
    [],
    `這些引用屬於部門 ${dept} 以外的文件(或這個場景根本不知道它屬於哪個部門)`,
  );
});

Then("no citation belongs to a document in department {string}", function (this: KmWorld, dept: string) {
  const s = i2State(this);
  const citations = citationsOf(this);
  const leaked = citations.filter((c) => s.documentDept.get(c.documentId) === dept);
  assert.deepEqual(
    leaked.map((c) => c.documentId),
    [],
    `這些引用洩漏了部門 ${dept} 的文件:${JSON.stringify(leaked)}`,
  );
});

Then("the answer carries no citation", function (this: KmWorld) {
  const citations = citationsOf(this);
  assert.deepEqual(citations, [], `應該沒有任何引用,實際 citations=${JSON.stringify(citations)}`);
});

Then("the answer says it found nothing to cite", function (this: KmWorld) {
  const content = String(lastAssistantMessage(this)["content"] ?? "");
  assert.ok(
    content.includes("沒有可引用的來源"),
    `答案應該說明找不到可引用的來源(services/generation 的空脈絡短路文字「沒有可引用的來源」),` +
      `實際 content=「${content}」`,
  );
});

// ================================================================== I2 —— @regression SSE/list 場景
//
// 與 conversation.steps.ts 的 phase-1 SSE 步驟同樣走法(真的 listen() + 真的
// http.request),但走真實 server(this.app,不是 buildTestApp() 的 harness),
// 因為 Background 已經是「a fresh server with fake providers」。這裡獨立寫一份
// 而不 import conversation.steps.ts,理由同檔頭:角色守門不准跨能力資料夾
// import steps。

interface I2ChangeFrame {
  readonly seq: number;
  readonly type: string;
  readonly data: Record<string, unknown>;
}

function framesOfI2(buffer: string): I2ChangeFrame[] {
  const frames: I2ChangeFrame[] = [];
  for (const block of buffer.split("\n\n")) {
    const seq = /^id: (\d+)$/m.exec(block);
    const type = /^event: (\S+)$/m.exec(block);
    const data = /^data: (\{.*\})$/m.exec(block);
    if (!seq || !type || !data) continue;
    frames.push({ seq: Number(seq[1]), type: type[1] as string, data: JSON.parse(data[1] as string) as Record<string, unknown> });
  }
  return frames;
}

async function waitUntilI2(predicate: () => boolean, what: string, timeoutMs = 4_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`等 ${what} 超過 ${timeoutMs}ms 仍未出現`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function openI2SseWindow(app: FastifyInstance, port: number, cookie: string): Promise<I2SseWindow> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: "/v1/conversations/events",
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    request.on("error", reject);
    request.on("response", (response) => {
      let text = "";
      response.on("data", (chunk: Buffer) => {
        text += chunk.toString("utf8");
      });
      resolve({
        statusCode: response.statusCode ?? 0,
        buffer: () => text,
        close: () => {
          response.destroy();
          request.destroy();
        },
      });
    });
    request.end();
  });
}

When(
  "the demo user creates a conversation and sends one message",
  { timeout: 30_000 },
  async function (this: KmWorld) {
    const s = await ensureI2State(this);
    const person = await loginI2DemoUser(this);

    if (s.app.server.address() === null) {
      await s.app.listen({ port: 0, host: "127.0.0.1" });
    }
    const port = (s.app.server.address() as AddressInfo).port;
    const window = await openI2SseWindow(s.app, port, person.cookie);
    assert.equal(window.statusCode, 200, `SSE 連線應為 200,實際 ${window.statusCode}`);
    await waitUntilI2(() => window.buffer().includes(": connected"), "SSE 連線建立訊息");
    s.sseWindow = window;

    const createRes = await s.app.inject({
      method: "POST",
      url: "/v1/conversations",
      headers: { "x-requested-with": "XMLHttpRequest" },
      cookies: { [SESSION_COOKIE_NAME]: person.cookie },
      payload: {},
    });
    assert.equal(createRes.statusCode, 201, `建立對話應為 201,實際 ${createRes.statusCode}:${createRes.body}`);
    person.conversationId = (createRes.json() as { id: string }).id;

    const messageRes = await s.app.inject({
      method: "POST",
      url: `/v1/conversations/${person.conversationId}/messages`,
      headers: { "x-requested-with": "XMLHttpRequest" },
      cookies: { [SESSION_COOKIE_NAME]: person.cookie },
      payload: { role: "user", content: "I2 regression 場景的訊息內容,不驗證引用" },
    });
    assert.equal(messageRes.statusCode, 201, `送出訊息應為 201,實際 ${messageRes.statusCode}:${messageRes.body}`);
    s.lastRegressionMessageId = (messageRes.json() as { id: string }).id;
  },
);

Then(
  "the conversation appears in the demo user's list",
  { timeout: 10_000 },
  async function (this: KmWorld) {
    const s = i2State(this);
    const person = s.people.get(I2_DEMO_USERNAME);
    assert.ok(person?.conversationId, "還沒有建立任何對話");
    const res = await s.app.inject({
      method: "GET",
      url: "/v1/conversations",
      cookies: { [SESSION_COOKIE_NAME]: person!.cookie },
    });
    assert.equal(res.statusCode, 200, `讀取對話列表應為 200,實際 ${res.statusCode}:${res.body}`);
    const page = res.json() as { items: { id: string }[] };
    assert.ok(
      page.items.some((c) => c.id === person!.conversationId),
      `對話 ${person!.conversationId} 應該出現在 demo-user 自己的對話列表裡,實際列表=${JSON.stringify(page.items)}`,
    );
  },
);

Then(
  "a change event for that message is delivered on the stream",
  { timeout: 4_000 },
  async function (this: KmWorld) {
    const s = i2State(this);
    assert.ok(s.sseWindow, "還沒有開任何 SSE 視窗");
    assert.ok(s.lastRegressionMessageId, "還沒有送出過任何訊息");
    await waitUntilI2(
      () => s.sseWindow!.buffer().includes(s.lastRegressionMessageId!),
      "訊息的變更事件出現在 SSE 串流裡",
    );
    const frames = framesOfI2(s.sseWindow!.buffer());
    const matched = frames.find(
      (f) => f.type === "message.created" && f.data["messageId"] === s.lastRegressionMessageId,
    );
    assert.ok(
      matched,
      `SSE 串流裡應該有一則 message.created 事件,data.messageId 等於剛送出的訊息 id(${s.lastRegressionMessageId}),` +
        `實際收到的 frames=${JSON.stringify(frames)}`,
    );
  },
);

After({ tags: "@i2" }, function (this: KmWorld) {
  const s = this.bag["i2"] as I2State | undefined;
  s?.sseWindow?.close();
});
