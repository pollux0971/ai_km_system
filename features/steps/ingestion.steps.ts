/**
 * 05-ingestion phase-1 步驟(回填)。
 *
 * 每一步呼叫的入口都是 services/ingestion 自己的 vitest 測試在呼叫的那個:
 * `createIngestionService().ingest()`(pipeline.test.ts W1-00 / E06-S043、
 * embedding-identity.test.ts AC1/AC2)、`extractPdfText()`
 * (extraction/pdf-extract.test.ts AC2/AC3/AC5/AC6)、`chunkDocument()`
 * (chunking/chunk.test.ts)、`ingestionPlugin` 走真實 register()→ready()
 * (plugin.test.ts AC-IS1/AC-IS4)。這裡不 mock 任何接縫;唯一的假東西是
 * PF1 的 deterministic embedding provider,那是既有測試本來就在用的。
 *
 * ## 為什麼有些句子在這裡找不到定義
 *
 * 「the model gateway uses the deterministic embedding provider」「an in-memory
 * vector store」「the real Chinese fixture PDF is ingested under department
 * {string}」「the real Chinese fixture PDF is ingested with an empty department」
 * 「the vector store is still empty」這幾句**已經定義在 `integration.steps.ts`**
 * (I1 先綁的時候本檔還不存在),本檔**原文沿用、不重新定義**——cucumber 的步驟是
 * 全域命名空間,為了避開撞名而發明第二套措辭會讓同一件事在 repo 裡有兩種講法。
 * 那些句子屬於 ingestion 這個能力,搬家(integration → 本檔)由協調者在合併點做,
 * 見 FEATURE.md「待協調」。
 *
 * 因此本檔的共用狀態讀的是 `this.bag["i1"]`(integration 的 Background 建的那份
 * 管線);本檔自己多出來的暫存(最近一次 ingest 的回報、重匯前的可見內容……)
 * 放在 `this.bag["ingestion05"]`,不去汙染那份共用狀態。
 */
import { Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { join } from "node:path";
import Fastify from "fastify";
import type { KmWorld } from "./_world.js";

import type { EmbedResponse, GenerateResponse, ModelGateway } from "../../services/model-gateway/src/gateway.js";
import { createDeterministicEmbeddingProvider } from "../../services/model-gateway/src/embedding/deterministic.provider.js";
import type { RetrievalHit, VectorStore } from "../../services/retrieval/src/vector/store.js";
import { toRetrievalScope } from "../../services/retrieval/src/authorization/scope.js";
import type { RetrievalService } from "../../services/retrieval/src/service.js";
import { chunkDocument, type Chunk } from "../../services/ingestion/src/chunking/chunk.js";
import { extractPdfText, type PdfExtractionResult } from "../../services/ingestion/src/extraction/pdf-extract.js";
import { ingestionPlugin } from "../../services/ingestion/src/plugin.js";
import {
  createIngestionService,
  type IngestDocumentResult,
  type IngestionService,
} from "../../services/ingestion/src/service.js";

const FIXTURE_DIR = "services/ingestion/src/extraction/fixtures";
/** 真實中文 PDF(非內嵌字型),與 I1 用的是同一份 */
const CJK_PDF = `${FIXTURE_DIR}/cjk-non-embedded.pdf`;
const IMAGE_ONLY_PDF = `${FIXTURE_DIR}/image-only.pdf`;
const ENCRYPTED_PDF = `${FIXTURE_DIR}/encrypted.pdf`;

/**
 * 只用來把索引好的 chunk 讀回來的探測查詢。內容不影響任何斷言——本檔的斷言看的是
 * 偏移量、embedding 身分與可見性,不是排序。
 */
const PROBE_QUERY = "知識管理系統設計文件";

/** integration.steps.ts 的 Background 兩句 Given 建起來的共用管線(`this.bag["i1"]`)。 */
interface SharedPipeline {
  modelGateway: ModelGateway;
  vectorStore: VectorStore;
  ingestion: IngestionService;
  /** documentId → 該次匯入所依據的獨立抽取原文(offsets 的 ground truth) */
  originals: Map<string, string>;
}

function pipeline(world: KmWorld): SharedPipeline {
  const s = world.bag["i1"] as SharedPipeline | undefined;
  assert.ok(
    s && s.vectorStore && s.ingestion && s.modelGateway,
    "Background 尚未建立 ingestion 管線(the model gateway uses… / an in-memory vector store)",
  );
  return s;
}

/** 本檔自己的暫存,不與 `bag["i1"]` 混在一起。 */
interface Phase1Extras {
  lastIngest?: IngestDocumentResult;
  extractions?: PdfExtractionResult[];
  cuts?: readonly (readonly Chunk[])[];
  /** 重匯被拒之前,finance 看得到的東西 */
  before?: readonly RetrievalHit[];
}

function extras(world: KmWorld): Phase1Extras {
  let e = world.bag["ingestion05"] as Phase1Extras | undefined;
  if (!e) {
    e = {};
    world.bag["ingestion05"] = e;
  }
  return e;
}

function fixtureBytes(world: KmWorld, relPath: string): Uint8Array {
  // 每次都重新讀:pdfjs 的 worker transport 會 detach 傳進去的 buffer
  // (pipeline.test.ts 的同一個註解),同一個 Uint8Array 用第二次會拋 DataCloneError。
  return world.readRepoBytes(relPath);
}

/** 已經被匯入(或嘗試匯入)的那一份文件的 documentId。回填期間一個場景只碰一份。 */
function theStoredDocumentId(world: KmWorld): string {
  const ids = [...pipeline(world).originals.keys()];
  assert.equal(ids.length, 1, `本場景預期剛好有一份已匯入的文件,實際 ${JSON.stringify(ids)}`);
  return ids[0]!;
}

/** 嘗試匯入,並把拒絕收進 world.lastError(共用步驟 `it is rejected with {string}` 讀它)。 */
async function attemptIngest(world: KmWorld, documentId: string, scopeKey: string, fixture: string): Promise<void> {
  const s = pipeline(world);
  try {
    extras(world).lastIngest = await s.ingestion.ingest({
      documentId,
      scopeKey,
      pdfBytes: fixtureBytes(world, fixture),
    });
    world.lastResult = extras(world).lastIngest;
  } catch (error) {
    world.lastError = error as Error;
    extras(world).lastIngest = undefined;
  }
}

/** 某個部門現在看得到的 chunk。純讀,不改變 store。 */
async function visibleTo(world: KmWorld, dept: string): Promise<readonly RetrievalHit[]> {
  const s = pipeline(world);
  const scope = toRetrievalScope({
    principalId: `ingestion-probe-${dept}`,
    allowedScopeKeys: [`dept:${dept}`],
    deniedScopeKeys: [],
  });
  const probe = await s.modelGateway.embed({ input: [PROBE_QUERY] }, `ingestion-probe-${dept}`);
  const first = probe.data[0];
  assert.ok(first, "探測查詢沒有拿到嵌入向量");
  return s.vectorStore.query(Float32Array.from(first.embedding), scope, 100);
}

/** 一筆 hit 的「身分 + 位置 + 內容開頭」,比對重匯前後用的可讀指紋。 */
function fingerprint(hit: RetrievalHit): string {
  return `${hit.chunkId}|${hit.scopeKey}|${hit.startOffset}-${hit.endOffset}|${hit.text.slice(0, 12)}`;
}

function reported(world: KmWorld): IngestDocumentResult {
  const result = extras(world).lastIngest;
  assert.ok(
    result,
    `沒有成功的 ingest 可以斷言(可能被拒絕:${world.lastError?.name} ${world.lastError?.message})`,
  );
  return result;
}

// ---------------------------------------------------------------- Given

Given("what the finance department can see is recorded", async function (this: KmWorld) {
  const e = extras(this);
  e.before = await visibleTo(this, "finance");
  // 錄到空的就沒什麼好比對——之後的「前後相同」會退化成空對空,永遠成立。
  assert.ok(e.before.length > 0, "錄製 finance 的可見內容時拿到 0 筆,場景前提沒成立");
});

Given("the model gateway stops reporting which embedding model it used", function (this: KmWorld) {
  const s = pipeline(this);
  // 與 embedding-identity.test.ts 的 fakeModelGateway 同一種替換:繞過 gateway.ts
  // 自己的驗證,好讓 services/ingestion 那道獨立守門是本場景唯一會響的東西。
  const silent: ModelGateway = {
    async embed(): Promise<EmbedResponse> {
      return { model: "", dimensions: 256, data: [] };
    },
    async generate(): Promise<GenerateResponse> {
      throw new Error("ingestion 只用 embedding,generate() 不應被呼叫。");
    },
    providers: s.modelGateway.providers,
  };
  s.modelGateway = silent;
  s.ingestion = createIngestionService({ modelGateway: silent, vectorStore: s.vectorStore });
});

Given("the embedding work the pipeline does is counted", function (this: KmWorld) {
  const s = pipeline(this);
  const inner = s.modelGateway;
  // 只多記一筆,回傳值一字不改——讓「未授權就不該花任何力氣」變成可斷言的量
  // (共用步驟 `the "{string}" provider is never called` 讀 world.providerCalls)。
  const counting: ModelGateway = {
    embed: async (request, correlationId) => {
      this.providerCalls.push({ component: "embedding", detail: `${request.input.length} text(s)` });
      return inner.embed(request, correlationId);
    },
    generate: (request, correlationId) => inner.generate(request, correlationId),
    providers: inner.providers,
  };
  s.modelGateway = counting;
  s.ingestion = createIngestionService({ modelGateway: counting, vectorStore: s.vectorStore });
});

// ---------------------------------------------------------------- When

/**
 * 本來想用 common.steps.ts 的「the {string} plugin is registered on a bare server
 * and the server becomes ready」,但那個通用步驟的 cucumber expression 有一個
 * {string} 參數、handler 卻宣告 0 個參數,cucumber 直接拒絕(「function has 0
 * arguments, should have 1」)——2026-09-04 實測,在此之前沒有任何 .feature 用過它,
 * 所以沒人踩到。修共用檔是協調者的事,見 FEATURE.md「待協調」。這裡照
 * retrieval.steps.ts 的樣式自己註冊,但仍把註冊後的 server 放進
 * `this.bag["registeredApp"]`,讓通用的「the {string} plugin is visible on the
 * parent server instance」照常從**父實例**斷言 decoration(ADR 0007 §5)。
 */
When(
  "the ingestion plugin is registered on a host application and that application becomes ready",
  { timeout: 30_000 },
  async function (this: KmWorld) {
    const s = pipeline(this);
    const instance = Fastify({ logger: false });
    await instance.register(ingestionPlugin, { service: s.ingestion });
    await instance.ready();
    this.bag["registeredApp"] = instance;
  },
);

When(
  "the Chinese manual PDF is ingested through the host's ingestion seam under department {string}",
  { timeout: 60_000 },
  async function (this: KmWorld, dept: string) {
    const app = this.bag["registeredApp"] as { ingestion?: IngestionService } | undefined;
    assert.ok(app?.ingestion, "父實例上看不到 app.ingestion——plugin 沒用 fp() 包裝(ADR 0007 §5)");
    extras(this).lastIngest = await app.ingestion.ingest({
      documentId: "host-seam-doc",
      scopeKey: `dept:${dept}`,
      pdfBytes: fixtureBytes(this, CJK_PDF),
    });
  },
);

When("the scanned image-only PDF is ingested under department {string}", { timeout: 60_000 }, async function (this: KmWorld, dept: string) {
  await attemptIngest(this, "image-only-doc", `dept:${dept}`, IMAGE_ONLY_PDF);
});

When("the password-protected PDF is ingested under department {string}", { timeout: 60_000 }, async function (this: KmWorld, dept: string) {
  await attemptIngest(this, "encrypted-doc", `dept:${dept}`, ENCRYPTED_PDF);
});

When(
  "the Chinese manual PDF reaches the embedding stage under department {string}",
  { timeout: 60_000 },
  async function (this: KmWorld, dept: string) {
    await attemptIngest(this, "identity-doc", `dept:${dept}`, CJK_PDF);
  },
);

When(
  "that same stored document is ingested again under department {string}",
  { timeout: 60_000 },
  async function (this: KmWorld, dept: string) {
    await attemptIngest(this, theStoredDocumentId(this), `dept:${dept}`, CJK_PDF);
  },
);

When("the Chinese manual PDF is extracted twice", { timeout: 60_000 }, async function (this: KmWorld) {
  extras(this).extractions = [
    await extractPdfText(fixtureBytes(this, CJK_PDF)),
    await extractPdfText(fixtureBytes(this, CJK_PDF)),
  ];
});

When("the extracted text of the Chinese manual PDF is cut into chunks twice", { timeout: 60_000 }, async function (this: KmWorld) {
  const { text } = await extractPdfText(fixtureBytes(this, CJK_PDF));
  extras(this).cuts = [chunkDocument("cut-doc", text), chunkDocument("cut-doc", text)];
});

// ---------------------------------------------------------------- Then

Then("that ingest reports the document to be {int} pages long", function (this: KmWorld, pages: number) {
  assert.equal(reported(this).pageCount, pages, `頁數應為 ${pages},實際 ${reported(this).pageCount}`);
});

Then("the ingestion store holds exactly as many chunks as the ingest reported", async function (this: KmWorld) {
  const result = reported(this);
  assert.ok(result.chunkCount > 0, "ingest 回報 0 個 chunk——管線沒有真的索引任何東西");
  const count = await pipeline(this).vectorStore.count();
  assert.equal(count, result.chunkCount, `store 內有 ${count} 筆,ingest 回報 ${result.chunkCount} 個 chunk`);
});

Then("the ingestion refusal message mentions {string}", function (this: KmWorld, marker: string) {
  assert.ok(this.lastError, "預期會被拒絕,但沒有任何錯誤被拋出");
  assert.ok(
    this.lastError.message.includes(marker),
    `拒絕訊息應說明「${marker}」,實際:${this.lastError.message}`,
  );
});

Then(
  "slicing the extracted document text by each stored chunk's offsets gives back that chunk word for word",
  async function (this: KmWorld) {
    const documentId = theStoredDocumentId(this);
    const text = pipeline(this).originals.get(documentId);
    assert.ok(text, `找不到 ${documentId} 的獨立抽取原文`);
    const hits = await visibleTo(this, "eng");
    const stored = await pipeline(this).vectorStore.count();
    assert.ok(stored > 0, "store 內一筆都沒有,沒有偏移量可以比對");
    assert.equal(hits.length, stored, `讀回 ${hits.length} 筆,store 內有 ${stored} 筆——有 chunk 沒被檢查到`);
    for (const hit of hits) {
      assert.equal(
        text.slice(hit.startOffset, hit.endOffset),
        hit.text,
        `chunk ${hit.chunkId} 的偏移量 ${hit.startOffset}–${hit.endOffset} 從原文切出來的不是它自己的文字`,
      );
    }
  },
);

Then("the extracted document text contains {string}", function (this: KmWorld, phrase: string) {
  const documentId = theStoredDocumentId(this);
  const text = pipeline(this).originals.get(documentId);
  assert.ok(text, `找不到 ${documentId} 的獨立抽取原文`);
  assert.ok(
    text.includes(phrase),
    `抽取結果應含「${phrase}」(非內嵌 CJK 字型抽壞時會變成空字串或亂碼),實際開頭:${text.slice(0, 60)}`,
  );
});

Then("both extractions hash to {string}", function (this: KmWorld, expected: string) {
  const runs = extras(this).extractions;
  assert.ok(runs && runs.length === 2, "需要兩次抽取結果");
  const hashes = runs.map((e) => createHash("sha256").update(e.text, "utf8").digest("hex"));
  assert.deepEqual(hashes, [expected, expected], `抽取結果的 sha256 應為 ${expected},實際 ${hashes.join(" / ")}`);
});

Then("the extractor names itself {string}", function (this: KmWorld, version: string) {
  const runs = extras(this).extractions;
  assert.ok(runs && runs.length === 2, "需要兩次抽取結果");
  const versions = runs.map((e) => e.extractorVersion);
  assert.deepEqual(versions, [version, version], `抽取器版本應為 ${version},實際 ${versions.join(" / ")}`);
});

Then("the finance department still sees exactly the chunks it saw before", async function (this: KmWorld) {
  const before = extras(this).before;
  assert.ok(before, "沒有先錄下 finance 的可見內容");
  const after = await visibleTo(this, "finance");
  const beforeIds = before.map(fingerprint);
  const afterIds = after.map(fingerprint);
  assert.deepEqual(
    afterIds,
    beforeIds,
    `重匯前後 finance 看到的 chunk 不同——之前:${JSON.stringify(beforeIds)};之後:${JSON.stringify(afterIds)}`,
  );
});

Then("the maintenance department sees none of that document", async function (this: KmWorld) {
  const documentId = theStoredDocumentId(this);
  const leaked = (await visibleTo(this, "maintenance")).filter((h) => h.documentId === documentId);
  assert.deepEqual(
    leaked.map(fingerprint),
    [],
    `maintenance 不該看到 ${documentId} 的任何 chunk,實際看到:${JSON.stringify(leaked.map(fingerprint))}`,
  );
});

Then(
  "every stored chunk records embedding model {string} with {int} dimensions",
  async function (this: KmWorld, model: string, dimensions: number) {
    const hits = await visibleTo(this, "eng");
    const stored = await pipeline(this).vectorStore.count();
    assert.ok(stored > 0, "store 內一筆都沒有,沒有 embedding 身分可以比對");
    assert.equal(hits.length, stored, `讀回 ${hits.length} 筆,store 內有 ${stored} 筆——有 chunk 沒被檢查到`);
    for (const hit of hits) {
      assert.equal(hit.embeddingModel, model, `chunk ${hit.chunkId} 記錄的 embedding model 是 ${hit.embeddingModel}`);
      assert.equal(
        hit.embeddingDimensions,
        dimensions,
        `chunk ${hit.chunkId} 記錄的維度是 ${hit.embeddingDimensions}`,
      );
    }
  },
);

Then("both cuts produce the same chunk ids in the same order", function (this: KmWorld) {
  const cuts = extras(this).cuts;
  assert.ok(cuts && cuts.length === 2, "需要兩次切塊結果");
  const [a, b] = cuts;
  assert.ok(a && b && a.length > 0, "切塊結果為空,無從比較");
  assert.deepEqual(
    b.map((c) => c.chunkId),
    a.map((c) => c.chunkId),
    "同一份文字切兩次的 chunk id 不同——重新索引會讓既有引用全部失效",
  );
});

Then("both cuts put every chunk boundary at the same character", function (this: KmWorld) {
  const cuts = extras(this).cuts;
  assert.ok(cuts && cuts.length === 2, "需要兩次切塊結果");
  const [a, b] = cuts;
  assert.ok(a && b && a.length > 0, "切塊結果為空,無從比較");
  const bounds = (chunks: readonly Chunk[]): string[] => chunks.map((c) => `${c.startOffset}-${c.endOffset}`);
  assert.deepEqual(bounds(b), bounds(a), "同一份文字切兩次的字元邊界不同");
});

// ==================================================================
// phase-2(紅)—— 一份索引好的 PDF 接到 apps/api 真實 buildServer() 上的檢索。
// 規格來源:docs/adr/0015-composition-root-owns-the-retrieval-store.md。
//
// 每一步只呼叫今天已經存在的符號:KmWorld.startServer()(apps/api 真實
// buildServer())、toRetrievalScope()(phase-1 已在用)、retrievalPlugin 裝的
// app.retrieval(services/retrieval,今天存在但store 永遠是全新的空 store)。
// 「索引」的步驟今天只檢查 app.ingestion 存不存在並記錄下來——它今天真的不存在
// (apps/api/src/server.ts 沒有 import ingestionPlugin),所以每個場景都紅在
// 斷言,不紅在編譯。細節與三個誠實記錄的限制見 phase-2.feature 開頭的說明。
//
// 沿用 features/steps/retrieval.steps.ts 已經定義的「a signed-in demo person
// tries to ask {string} through the real API server's own retrieval seam」——
// 那句話已經做了「登入 demo-user → 用 ADR 0014 的固定 dept:eng scope 問
// app.retrieval」,把結果放進 this.bag["compositionRoot"] /
// this.bag["compositionRootErrorName"]。這裡原文沿用、不重新定義,理由與
// integration.steps.ts 檔頭同一條:避免同一件事在 repo 裡長出第二種講法。
// ==================================================================

const INGESTION05_BOOT_DOC_PREFIX = "ingestion05-boot-";

interface CompositionRootHits {
  seamPresent?: boolean;
  hits?: readonly RetrievalHit[];
}

function compositionRootHits(world: KmWorld): CompositionRootHits | undefined {
  return world.bag["compositionRoot"] as CompositionRootHits | undefined;
}

/**
 * 嘗試透過 apps/api 真實 server 的 ingestion seam 索引 fixture PDF。今天
 * `app.ingestion` 不存在(server.ts 沒有註冊 ingestionPlugin),所以這個函式
 * 今天只會記下「seam 不存在」然後什麼都不做——這是誠實的現況,不是偷懶:
 * 一旦 composition root 接上 ingestionPlugin 並與 app.retrieval 共用 store,
 * 這裡就會真的把 fixture PDF 寫進那個共用 store,後面依賴它的斷言才會第一次
 * 被真正執行到並賦予意義。
 */
async function indexFixtureIntoRealServer(world: KmWorld, dept: string): Promise<void> {
  const app = await world.startServer();
  const seam = (app as unknown as { ingestion?: IngestionService }).ingestion;
  world.bag["ingestionSeamPresent"] = Boolean(seam);
  if (!seam) return;
  await seam.ingest({
    documentId: `${INGESTION05_BOOT_DOC_PREFIX}${dept}`,
    scopeKey: `dept:${dept}`,
    pdfBytes: fixtureBytes(world, CJK_PDF),
  });
}

/**
 * 場景 3 的前提——「index 時的 embedding 身分與現在配置的不同」——需要一個帶
 * `ingestionEmbeddingProvider` 覆寫的 server(`apps/api/src/server.ts`
 * `BuildServerOptions`,commit 7c62d06,ADR 0015「D2 的空守門怎麼補」)。
 *
 * 但 Background 的「a fresh server with fake providers」(common.steps.ts,
 * 共用檔,不可改)已經在這個場景一開始就呼叫過一次 `startServer()` 不帶任何
 * extra,而 `startServer()` 只要 `this.app` 已存在就直接回傳快取的實例
 * (`_world.ts`:`if (this.app) return this.app;`)——這裡再傳 extra 也不會被
 * 採用。這不是用讀的推斷:`admin-console.steps.ts` 的 `restartServerWithFakeAsr`
 * 已經實測並記錄過同一個現象(GHERKIN_WORKFLOW §5.3),照它的作法把 Background
 * 建的那個實例關掉、重建一個帶覆寫的,只動這個資料夾自己的檔。
 *
 * dimensions 換成 64(預設 256)就足以讓「不同 embedding 身分」成立——
 * `assertEmbeddingIdentityMatches`(services/retrieval/src/vector/store.ts)比對
 * 的是 `{ model, dimensions }` 這一對,維度本身就是身分的一部分,不需要另外編
 * 一種 provider 形狀或换 model 字串。
 */
async function restartServerWithStaleIngestionEmbedding(world: KmWorld): Promise<Awaited<ReturnType<KmWorld["startServer"]>>> {
  if (world.app) {
    await world.app.close();
    world.app = undefined;
  }
  return world.startServer({
    ingestionEmbeddingProvider: createDeterministicEmbeddingProvider({ dimensions: 64 }),
  });
}

/** 同 `indexFixtureIntoRealServer`,但先把 server 換成帶「舊 embedding 身分」的那個。 */
async function indexFixtureIntoRealServerWithStaleEmbedding(world: KmWorld, dept: string): Promise<void> {
  const app = await restartServerWithStaleIngestionEmbedding(world);
  const seam = (app as unknown as { ingestion?: IngestionService }).ingestion;
  world.bag["ingestionSeamPresent"] = Boolean(seam);
  if (!seam) return;
  await seam.ingest({
    documentId: `${INGESTION05_BOOT_DOC_PREFIX}${dept}`,
    scopeKey: `dept:${dept}`,
    pdfBytes: fixtureBytes(world, CJK_PDF),
  });
}

async function loginDemoPersonOnApp(app: Awaited<ReturnType<KmWorld["startServer"]>>, username: string): Promise<void> {
  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { username, password: "demo-pass-123" },
  });
  assert.equal(
    login.statusCode,
    200,
    `登入 ${username} 應成功(這一步只是確認 identity/session 沒壞,缺口專在 ingestion 沒被接進來):實際 ${login.statusCode} ${login.body}`,
  );
}

// ---------------------------------------------------------------- Given/When

When(
  "the real Chinese fixture PDF is indexed into the real API server's own store under department {string}",
  { timeout: 60_000 },
  async function (this: KmWorld, dept: string) {
    await indexFixtureIntoRealServer(this, dept);
  },
);

// 「back when a different embedding model was configured」:composition root
// 現在真的接上了 app.ingestion(commit 8f1d137)並提供了一個 test-only 的接縫
// (`BuildServerOptions.ingestionEmbeddingProvider`,commit 7c62d06,ADR 0015
// 「D2 的空守門怎麼補」裁決 (a))——`IngestionService.ingest()` 本身仍然沒有參數
// 可以指定 embedding 版本(單一 process 內任何生產呼叫都做不出「index 時與現在
// 用不同模型」這個狀態,這正是 enforceEmbeddingVersion 存在的唯一理由),但
// composition root 建構時可以換掉 `app.ingestion` 腳下的那顆 embedding provider,
// 藉此模擬「這份資料是模型換版之前索引的」。
//
// 資料仍然照樣走真實 `app.ingestion.ingest()` → 真的、與 `app.retrieval` 共用的
// `retrievalStore`(D1,場景 2 已經在驗那條路徑本身是通的)——只換 ingestion 腳下
// 的 embedding provider,production 的寫入路徑一步都沒有被繞過,ADR 0015 否決的
// 「用 store option 讓測試繞過 ingest()」沒有發生。
When(
  "the real Chinese fixture PDF is indexed into the real API server's own store under department {string}, back when a different embedding model was configured",
  { timeout: 60_000 },
  async function (this: KmWorld, dept: string) {
    await indexFixtureIntoRealServerWithStaleEmbedding(this, dept);
  },
);

When(
  "a second, independently started real API server is asked {string} through its own retrieval seam, standing in for the same server restarting",
  { timeout: 60_000 },
  async function (this: KmWorld, question: string) {
    const { buildServer } = await import("../../apps/api/src/server.js");
    const second = await buildServer({
      dbPath: join(this.useTempDir(), "ingestion05-restart.sqlite"),
      enableTestAuthProvider: true,
      loggerStream: { write() {} },
    });
    try {
      await loginDemoPersonOnApp(second, "demo-user");
      const retrievalSeam = (second as unknown as { retrieval?: RetrievalService }).retrieval;
      const scope = toRetrievalScope({ principalId: "demo-user", allowedScopeKeys: ["dept:eng"], deniedScopeKeys: [] });
      this.bag["restartHits"] = retrievalSeam ? await retrievalSeam.retrieve(question, scope, 3) : [];
    } finally {
      await second.close();
    }
  },
);

// ---------------------------------------------------------------- Then

Then(
  "the ingestion seam should be visible from the real server's parent instance, but it is not yet",
  function (this: KmWorld) {
    assert.ok(
      this.bag["ingestionSeamPresent"],
      "app.ingestion 在 apps/api 真實 buildServer() 的父實例上不存在——server.ts 今天沒有 import " +
        "ingestionPlugin,也沒有讓它與 retrievalPlugin 共用同一個 store(ADR 0015 決策 1/3,見 " +
        "features/05-ingestion/NEXT.md phase-2)。後果:就算索引本身完全正確,05-ingestion 也沒有任何 " +
        "方式把資料寫進 app.retrieval 實際查詢的那個 store——I2「問一個關於已索引文件的問題」在索引這一步 " +
        "就斷了。修法:比照 server.ts 既有的 conversationPlugin/feedbackPlugin 條件註冊樣式,composition " +
        "root 自建 store 與 RetrievalService(enforceEmbeddingVersion: true)交給 retrievalPlugin,再用 " +
        "既有的 registerSandboxSeeder 樣式把 fixture PDF 灌進同一個 store。",
    );
  },
);

Then(
  "the answer should include the chunk that was just indexed, not come back empty because indexing and querying used two different stores",
  function (this: KmWorld) {
    const s = compositionRootHits(this);
    assert.ok(s, "還沒有透過 composition root 的 retrieval seam 問過問題");
    const hits = s.hits ?? [];
    assert.ok(
      hits.length > 0 && hits.some((h) => h.documentId.startsWith(INGESTION05_BOOT_DOC_PREFIX)),
      `應該找到剛剛索引進去的 chunk,實際拿到 ${hits.length} 筆(${hits.map((h) => h.documentId).join(", ") || "無"})` +
        `——代表索引寫進的 store 與 app.retrieval 查詢的 store 不是同一個(ADR 0015 決策 1),` +
        `或 app.ingestion 這個 seam 今天根本不存在。`,
    );
  },
);

Then(
  "asking should be refused with {string}, not silently answered using a chunk indexed under a stale embedding identity",
  function (this: KmWorld, errorName: string) {
    const errName = this.bag["compositionRootErrorName"] as string | undefined;
    assert.ok(
      errName,
      "應該被 enforceEmbeddingVersion 的守門拒絕,但沒有任何錯誤被記錄下來(seam 不存在時這一步不會被執行到)",
    );
    assert.equal(errName, errorName, `錯誤類型應為 ${errorName},實際 ${errName}`);
  },
);

Then(
  "the second server's answer should come back empty, because the in-memory store does not survive past one process — 06-retrieval\\/phase-3 is what will make it persistent",
  function (this: KmWorld) {
    const hits = this.bag["restartHits"] as readonly RetrievalHit[] | undefined;
    assert.ok(hits, "還沒有問過第二個獨立啟動的 server");
    assert.deepEqual(
      hits.map((h) => h.chunkId),
      [],
      `第二個獨立啟動的 server 應該一筆都拿不到(in-memory store 不跨 process 存活),` +
        `實際拿到 ${hits.map((h) => h.chunkId).join(", ")}`,
    );
  },
);
