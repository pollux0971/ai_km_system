/**
 * 04-model-gateway phase-1 步驟(回填)。
 *
 * 每一步進的門,都是 services/model-gateway 自己的 vitest 測試進的那一道:
 * `createModelGateway()` + `createDeterministicEmbeddingProvider()` +
 * `createCannedGenerationProvider()`(gateway.test.ts AC-G1～G10)、
 * `modelGatewayPlugin` 走真實 `register()→ready()`(plugin.test.ts AC-P1～P5)、
 * `buildGatewayTestApp()` + `app.inject()`(model-gateway-routes.test.ts AC-R1～R12)、
 * `buildTestApp()` + 真的 multipart WAV(transcriptions.test.ts AC1/AC2)、
 * `loadContract()` / `expectResponseMatchesContract()`(同上的 L2 契約驗證)。
 *
 * 這裡不 mock 任何接縫:唯一「假」的東西是 provider 本身(PF1 deterministic /
 * canned),而那正是上述 vitest 測試本來就在用的東西。真模型是 PF3
 * (DECISIONS_NEEDED #2),phase-1 不碰。
 */
import { Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import Fastify, { type FastifyInstance, type FastifyRequest, type LightMyRequestResponse } from "fastify";
import type { KmWorld } from "./_world.js";

import { modelGatewayPlugin } from "../../services/model-gateway/src/plugin.js";
import {
  createModelGateway,
  type EmbedResponse,
  type GenerateResponse,
  type ModelGateway,
} from "../../services/model-gateway/src/gateway.js";
import { createDeterministicEmbeddingProvider } from "../../services/model-gateway/src/embedding/deterministic.provider.js";
import type {
  EmbeddingProvider,
  EmbedInput,
  EmbedResult,
} from "../../services/model-gateway/src/embedding/provider.js";
import { createCannedGenerationProvider } from "../../services/model-gateway/src/generation/canned.provider.js";
import type {
  ContextChunk,
  GenerateInput,
  GenerateResult,
  GenerationProvider,
} from "../../services/model-gateway/src/generation/provider.js";
import {
  buildGatewayTestApp,
  TEST_USER_HEADER,
} from "../../services/model-gateway/src/testing/build-gateway-test-app.js";
import { buildTestApp } from "../../services/model-gateway/src/testing/build-test-app.js";
import {
  expectResponseMatchesContract,
  loadContract,
} from "../../services/model-gateway/src/testing/contract-check.js";
import { makeMultipartRequest } from "../../services/model-gateway/src/testing/multipart-fixture.js";
import { makeWavBuffer } from "../../services/model-gateway/src/testing/wav-fixture.js";
import {
  FakeTranscriptionProvider,
  type TranscribeInput,
  type TranscribeResult,
  type TranscriptionProvider,
} from "../../services/model-gateway/src/asr/provider.js";

const CID = "cucumber-correlation-id";
const SIGNED_IN = { [TEST_USER_HEADER]: "u-cucumber" };

/** 兩段同一份維修手冊的原文;offsets 指回那份手冊全文。 */
const MAINTENANCE_DOC = "維修手冊第三章。軸承過熱應先停機並記錄運轉時數。若持續過熱應更換潤滑油。";
function passage(index: number, text: string): ContextChunk {
  const start = MAINTENANCE_DOC.indexOf(text);
  assert.ok(start >= 0, `來源文字必須出現在維修手冊全文裡:${text}`);
  return {
    chunkId: `doc-maint-001#${index}`,
    documentId: "doc-maint-001",
    text,
    startOffset: start,
    endOffset: start + text.length,
  };
}
const PASSAGES: readonly ContextChunk[] = [
  passage(0, "軸承過熱應先停機並記錄運轉時數"),
  passage(1, "若持續過熱應更換潤滑油"),
];

interface GatewayState {
  embedding: EmbeddingProvider;
  generation: GenerationProvider;
  gateway: ModelGateway;
  /** 上一次送給 embed() 的輸入,給「route 與 in-process 完全相同」那條用 */
  lastInput?: readonly string[];
  /** 被當成唯一來源交給 gateway 的段落 */
  sources: readonly ContextChunk[];
  /** ASR 端點的回應(轉錄場景) */
  asrApp?: FastifyInstance;
}

function state(world: KmWorld): GatewayState {
  const s = world.bag["modelGateway"] as GatewayState | undefined;
  assert.ok(s, "Background 尚未建立 model gateway");
  return s;
}

/** 把 provider 包一層紀錄器,讓通用步驟「the {string} provider is never called」有東西可看。 */
function recordEmbedding(world: KmWorld, inner: EmbeddingProvider): EmbeddingProvider {
  return {
    name: inner.name,
    model: inner.model,
    dimensions: inner.dimensions,
    fidelityCeiling: inner.fidelityCeiling,
    async embed(input: EmbedInput): Promise<EmbedResult> {
      world.providerCalls.push({ component: "embedding", detail: `${input.texts.length} texts` });
      return inner.embed(input);
    },
  };
}

function recordGeneration(world: KmWorld, inner: GenerationProvider): GenerationProvider {
  return {
    name: inner.name,
    model: inner.model,
    fidelityCeiling: inner.fidelityCeiling,
    async generate(input: GenerateInput): Promise<GenerateResult> {
      world.providerCalls.push({ component: "generation", detail: `${input.context.length} sources` });
      return inner.generate(input);
    },
  };
}

function recordTranscription(world: KmWorld, inner: TranscriptionProvider): TranscriptionProvider {
  return {
    name: inner.name,
    model: inner.model,
    async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
      world.providerCalls.push({ component: "transcription", detail: input.language });
      return inner.transcribe(input);
    },
  };
}

function rebuild(s: GatewayState): void {
  s.gateway = createModelGateway({ embedding: s.embedding, generation: s.generation });
}

/** 依 plugin.test.ts 的作法:宿主先 decorate requireSession 與 contracts,再註冊真的 plugin。 */
function prepareGatewayPlugin(world: KmWorld, specNames: readonly string[]): void {
  world.bag["pluginUnderTest"] = {
    register: async (app: FastifyInstance): Promise<void> => {
      app.decorate("requireSession", async function requireSession(request: FastifyRequest) {
        Object.assign(request, { auth: { userId: "u-cucumber" } });
      });
      // `apps/api` 的 ambient `declare module "fastify"` 把 `contracts` 宣告成完整的
      // ContractRegistry(_world.ts 匯入 apps/api/src/server.js 時一併載入)。這裡只需要
      // plugin 實際會讀的 `specNames()`(見 plugin-types.ts 的 hostSpecNames,它自己也是
      // 防禦性地讀),所以用一層窄化的 decorate 型別繞過整包 registry 的型別要求。
      (app as unknown as { decorate: (name: string, value: unknown) => void }).decorate("contracts", {
        specNames: () => [...specNames],
      });
      await app.register(modelGatewayPlugin, {
        nodeEnv: "test",
        asrProvider: "fake",
        asrServerUrl: "http://127.0.0.1:8080",
      });
    },
  };
}

async function embedInto(world: KmWorld, texts: readonly string[]): Promise<void> {
  const s = state(world);
  s.lastInput = texts;
  world.lastError = undefined;
  try {
    world.lastResult = await s.gateway.embed({ input: texts }, CID);
  } catch (error) {
    world.lastError = error as Error;
    world.lastResult = undefined;
  }
}

function embedResponse(world: KmWorld): EmbedResponse {
  const result = world.lastResult as EmbedResponse | undefined;
  assert.ok(result, `沒有嵌入結果(被拒絕:${world.lastError?.name} ${world.lastError?.message})`);
  return result;
}

// ---------------------------------------------------------------- Given

Given("a model gateway built on the deterministic embedder and the canned answer writer", function (this: KmWorld) {
  const embedding = recordEmbedding(this, createDeterministicEmbeddingProvider());
  const generation = recordGeneration(this, createCannedGenerationProvider());
  const s: GatewayState = {
    embedding,
    generation,
    gateway: createModelGateway({ embedding, generation }),
    sources: PASSAGES,
  };
  this.bag["modelGateway"] = s;
});

Given("the gateway plugin is prepared for a host that has loaded the embedding and generation contracts", function (this: KmWorld) {
  prepareGatewayPlugin(this, ["embedding", "generation"]);
});

Given("the gateway plugin is prepared for a host that has loaded no contracts", function (this: KmWorld) {
  prepareGatewayPlugin(this, []);
});

Given("the embedding provider declares {int} dimensions but answers with {int}-number vectors", function (this: KmWorld, declared: number, actual: number) {
  const s = state(this);
  // 與 gateway.test.ts AC-G4b 同一種破壞:provider 宣告 N 維,卻回傳 M 維的向量。
  s.embedding = recordEmbedding(this, {
    name: "fake",
    model: "embedding:wrong-width",
    dimensions: declared,
    fidelityCeiling: "PF1",
    async embed(input: EmbedInput): Promise<EmbedResult> {
      return {
        vectors: input.texts.map(() => new Array<number>(actual).fill(0.5)),
        model: "embedding:wrong-width",
        dimensions: actual,
      };
    },
  });
  rebuild(s);
});

Given("two maintenance passages are handed to the gateway as the only sources", function (this: KmWorld) {
  state(this).sources = PASSAGES;
});

Given("the answer writer invents an extra citation {string}", function (this: KmWorld, ghostChunkId: string) {
  const s = state(this);
  // 與 gateway.test.ts AC-G9 同一種破壞:provider 回傳一筆不在 context 裡的引用。
  s.generation = recordGeneration(this, {
    name: "fake",
    model: "generation:rogue",
    fidelityCeiling: "PF1",
    async generate(input: GenerateInput): Promise<GenerateResult> {
      return {
        answer: "(捏造的回答)",
        citations: [
          ...input.context.map((c) => ({
            chunkId: c.chunkId,
            documentId: c.documentId,
            startOffset: c.startOffset,
            endOffset: c.endOffset,
          })),
          { chunkId: ghostChunkId, documentId: "nowhere", startOffset: 0, endOffset: 1 },
        ],
        model: "generation:rogue",
      };
    },
  });
  rebuild(s);
});

Given("a transcription endpoint whose recogniser always returns {string}", async function (this: KmWorld, fakeText: string) {
  const s = state(this);
  const { app } = await buildTestApp(recordTranscription(this, new FakeTranscriptionProvider(fakeText)));
  s.asrApp = app;
});

// ---------------------------------------------------------------- When

/**
 * 本來應該用 common.steps.ts 的
 * `the {string} plugin is registered on a bare server and the server becomes ready`,
 * 但那句的 handler 宣告了 0 個參數而句子有一個 `{string}`,cucumber 直接報
 * 「function has 0 arguments, should have 1」——目前無法使用(見 FEATURE.md「待協調」)。
 * 這裡的實作與那句逐字相同(讀 `pluginUnderTest`、`register()` → `ready()`、把
 * server 放進 `registeredApp`),協調者修好共用檔之後,把 feature 檔這一句換回通用
 * 句子、刪掉這個定義即可,其他步驟完全不用動。
 */
When("the model gateway plugin is registered on a bare server and the server becomes ready", { timeout: 30_000 }, async function (this: KmWorld) {
  const under = this.bag["pluginUnderTest"] as { register: (app: FastifyInstance) => Promise<void> | void } | undefined;
  assert.ok(under, "Given 要先準備好要註冊的 model gateway plugin");
  const instance = Fastify({ logger: false });
  await under.register(instance);
  await instance.ready();
  this.bag["registeredApp"] = instance;
});

When("the gateway embeds {string}", async function (this: KmWorld, text: string) {
  await embedInto(this, [text]);
});

When("the gateway embeds {string}, {string} and {string}", async function (this: KmWorld, a: string, b: string, c: string) {
  await embedInto(this, [a, b, c]);
});

When("the gateway embeds a batch of {int} texts", async function (this: KmWorld, count: number) {
  await embedInto(this, Array.from({ length: count }, (_, i) => `第 ${i} 段維修紀錄`));
});

When("someone asks the gateway {string}", async function (this: KmWorld, question: string) {
  const s = state(this);
  this.lastError = undefined;
  try {
    this.lastResult = await s.gateway.generate({ question, context: s.sources }, CID);
  } catch (error) {
    this.lastError = error as Error;
    this.lastResult = undefined;
  }
});

When("someone asks the gateway {string} with no sources at all", async function (this: KmWorld, question: string) {
  const s = state(this);
  this.lastError = undefined;
  try {
    this.lastResult = await s.gateway.generate({ question, context: [] }, CID);
  } catch (error) {
    this.lastError = error as Error;
    this.lastResult = undefined;
  }
});

When("a signed-in caller posts {string} and {string} to the embeddings route", async function (this: KmWorld, a: string, b: string) {
  const s = state(this);
  s.lastInput = [a, b];
  const { app } = await buildGatewayTestApp(s.gateway);
  this.lastResponse = await app.inject({
    method: "POST",
    url: "/v1/embeddings",
    headers: SIGNED_IN,
    payload: { input: [a, b] },
  });
});

When("a signed-in caller posts an empty input list to the embeddings route", async function (this: KmWorld) {
  const { app } = await buildGatewayTestApp(state(this).gateway);
  this.lastResponse = await app.inject({
    method: "POST",
    url: "/v1/embeddings",
    headers: SIGNED_IN,
    payload: { input: [] },
  });
});

When("an anonymous caller posts {string} to the embeddings route", async function (this: KmWorld, text: string) {
  const { app } = await buildGatewayTestApp(state(this).gateway);
  this.lastResponse = await app.inject({
    method: "POST",
    url: "/v1/embeddings",
    payload: { input: [text] },
  });
});

When("a signed-in caller posts {string} to that bare server's embeddings route", async function (this: KmWorld, text: string) {
  const app = this.bag["registeredApp"] as FastifyInstance | undefined;
  assert.ok(app, "還沒有透過通用步驟註冊 model gateway plugin");
  this.lastResponse = await app.inject({
    method: "POST",
    url: "/v1/embeddings",
    payload: { input: [text] },
  });
});

When("a signed-in person uploads a {int} ms clip recorded at {int} Hz for transcription", async function (this: KmWorld, durationMs: number, sampleRate: number) {
  const s = state(this);
  assert.ok(s.asrApp, "還沒有建立轉錄端點");
  const { payload, headers } = makeMultipartRequest({
    audio: { buffer: makeWavBuffer({ durationMs, sampleRate }) },
    language: "zh",
  });
  this.lastResponse = await s.asrApp.inject({
    method: "POST",
    url: "/v1/transcriptions",
    headers: { ...SIGNED_IN, ...headers },
    payload,
  });
});

// ---------------------------------------------------------------- Then

Then("embedding {string} through that gateway seam yields one {int}-number vector of magnitude 1", async function (this: KmWorld, text: string, dimensions: number) {
  const app = this.bag["registeredApp"] as { modelGateway?: ModelGateway } | undefined;
  assert.ok(app?.modelGateway, "app.modelGateway 在父實例上看不到——plugin 沒用 fp() 包裝(ADR 0007 §5)");
  const result = await app.modelGateway.embed({ input: [text] }, CID);
  assert.equal(result.data.length, 1, `一段文字應得到一個向量,實際 ${result.data.length} 個`);
  const vector = result.data[0]?.embedding ?? [];
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  assert.ok(
    Math.abs(magnitude - 1) < 1e-6,
    `向量的 L2 長度應為 1(±1e-6),實際 ${magnitude}——未 L2 正規化的向量會讓點積不等於 cosine,` +
      `檢索排序看起來合理但是錯的(embedding.yaml「Normalisation is contractual」)。`,
  );
  assert.equal(vector.length, dimensions, `向量維度應為 ${dimensions},實際 ${vector.length}`);
});

Then("the gateway returns {int} embedding vectors whose positions are {int}, {int}, {int} in that order", function (this: KmWorld, count: number, a: number, b: number, c: number) {
  const result = embedResponse(this);
  assert.deepEqual(
    result.data.map((d) => d.index),
    [a, b, c],
    `回應必須依輸入順序帶上位置 ${[a, b, c].join(", ")},實際 ${JSON.stringify(result.data.map((d) => d.index))}` +
      `——位置錯位會讓每一段引用指到別段文字。`,
  );
  assert.equal(result.data.length, count, `應有 ${count} 個向量,實際 ${result.data.length}`);
});

Then("the three returned vectors differ from one another", function (this: KmWorld) {
  const vectors = embedResponse(this).data.map((d) => JSON.stringify(d.embedding));
  const unique = new Set(vectors);
  assert.equal(
    unique.size,
    vectors.length,
    `三段不同的文字應得到三個不同的向量,實際只有 ${unique.size} 個相異值` +
      `——所有文字得到同一個向量代表雜湊沒有看內容,檢索會退化成隨機排序。`,
  );
});

Then("the gateway refuses the oversized batch, naming the {int} limit and the {int} texts it was sent", function (this: KmWorld, limit: number, sent: number) {
  const returned = this.lastResult as EmbedResponse | undefined;
  assert.ok(
    this.lastError,
    `超量批次必須被拒絕,實際卻回傳了 ${returned?.data.length} 個向量——靜默截斷會讓後面的段落沒有向量卻沒有人知道。`,
  );
  assert.equal(this.lastError.name, "ModelGatewayPayloadTooLargeError", `錯誤類型應為 ModelGatewayPayloadTooLargeError,實際 ${this.lastError.name}:${this.lastError.message}`);
  assert.ok(this.lastError.message.includes(String(limit)), `訊息應說出上限 ${limit}:${this.lastError.message}`);
  assert.ok(this.lastError.message.includes(String(sent)), `訊息應說出收到的 ${sent}:${this.lastError.message}`);
});

Then("the gateway refuses the mismatched vectors, naming the declared {int} and the returned {int}", function (this: KmWorld, declared: number, actual: number) {
  const returned = this.lastResult as EmbedResponse | undefined;
  assert.ok(
    this.lastError,
    `維度不符必須被拒絕,實際卻回傳了 dimensions=${returned?.dimensions}、向量長度=${returned?.data[0]?.embedding.length}` +
      `——維度不一致不會報錯,相似度會照算並靜默給出錯誤的排序。`,
  );
  assert.equal(this.lastError.name, "EmbeddingUnavailableError", `錯誤類型應為 EmbeddingUnavailableError,實際 ${this.lastError.name}:${this.lastError.message}`);
  assert.ok(this.lastError.message.includes(String(declared)), `訊息應說出 provider 宣告的 ${declared}:${this.lastError.message}`);
  assert.ok(this.lastError.message.includes(String(actual)), `訊息應說出實際回傳的 ${actual}:${this.lastError.message}`);
});

Then("the answer cites {string} then {string}, in the order they were supplied", function (this: KmWorld, first: string, second: string) {
  const result = this.lastResult as GenerateResponse | undefined;
  assert.ok(result, `沒有答案(被拒絕:${this.lastError?.name} ${this.lastError?.message})`);
  assert.deepEqual(
    result.citations.map((c) => c.chunkId),
    [first, second],
    `引用必須正好是交出去的兩段來源且依序,實際 ${JSON.stringify(result.citations.map((c) => c.chunkId))}`,
  );
});

Then("the gateway refuses the whole answer, naming the invented {string}", function (this: KmWorld, ghostChunkId: string) {
  const result = this.lastResult as GenerateResponse | undefined;
  assert.ok(
    this.lastError,
    `捏造的引用必須讓整個回應被拒,實際卻回答了「${result?.answer}」並帶著引用 ` +
      `${JSON.stringify(result?.citations.map((c) => c.chunkId))}——濾掉那一筆再服務出去,看起來會完全正常。`,
  );
  assert.equal(this.lastError.name, "FabricatedCitationError", `錯誤類型應為 FabricatedCitationError,實際 ${this.lastError.name}:${this.lastError.message}`);
  assert.ok(this.lastError.message.includes(ghostChunkId), `訊息應點名被捏造的 ${ghostChunkId}:${this.lastError.message}`);
});

Then("the gateway declines to answer without sources, rather than answering from memory", function (this: KmWorld) {
  const result = this.lastResult as GenerateResponse | undefined;
  assert.ok(
    this.lastError,
    `沒有任何來源時必須拒絕作答,實際卻回答了「${result?.answer}」` +
      `——沒有引用的答案,對讀的人來說跟幻覺無法區分。`,
  );
  assert.equal(this.lastError.name, "GenerationNoContextError", `錯誤類型應為 GenerationNoContextError,實際 ${this.lastError.name}:${this.lastError.message}`);
});

Then("the embeddings route answered exactly what the in-process gateway answers", async function (this: KmWorld) {
  const s = state(this);
  const response = this.lastResponse;
  assert.ok(response, "還沒有送出任何請求");
  assert.ok(s.lastInput, "不知道這次送出去的是哪些文字");
  assert.equal(response.statusCode, 200, `route 應回 200,實際 ${response.statusCode}:${response.body}`);
  const inProcess = await s.gateway.embed({ input: s.lastInput }, CID);
  assert.deepEqual(
    response.json(),
    JSON.parse(JSON.stringify(inProcess)),
    "HTTP 路由與 in-process 呼叫回的東西不一樣——那代表路由不是薄包裝,是第二套實作(ADR 0007 §2)。",
  );
});

Then("the body satisfies the {string} contract for {string} at status {int}", async function (this: KmWorld, contractName: string, routePath: string, status: number) {
  const response = this.lastResponse;
  assert.ok(response, "還沒有送出任何請求");
  const registry = await loadContract(contractName);
  expectResponseMatchesContract(registry, routePath, "post", status, response.json());
});

Then("the transcript reads {string} while the recogniser's own raw text stays {string}", function (this: KmWorld, normalised: string, raw: string) {
  const response = this.lastResponse as LightMyRequestResponse | undefined;
  assert.ok(response, "還沒有上傳任何錄音");
  assert.equal(response.statusCode, 200, `應為 200,實際 ${response.statusCode}:${response.body}`);
  const body = response.json() as { text?: string; rawText?: string };
  assert.equal(body.text, normalised, `轉錄結果應轉成正體中文「${normalised}」,實際「${body.text}」`);
  assert.equal(body.rawText, raw, `原始辨識文字應原樣保留「${raw}」,實際「${body.rawText}」`);
});

Then("the transcription refusal reason is {string}", function (this: KmWorld, reason: string) {
  const response = this.lastResponse;
  assert.ok(response, "還沒有上傳任何錄音");
  const body = response.json() as { details?: { reason?: string } };
  assert.equal(
    body.details?.reason,
    reason,
    `錄音被拒的理由應為 ${reason},實際 ${body.details?.reason}:${response.body}`,
  );
});
