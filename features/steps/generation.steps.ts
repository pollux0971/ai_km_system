/**
 * 07-generation phase-1 步驟(回填)。
 *
 * 每一步呼叫的入口都是 services/generation 自己的 vitest 測試在呼叫的那個:
 * `createGenerationService()`(service.test.ts AC1～AC5 與「空字串問題被拒絕」)、
 * `generationPlugin` 走真實 `register()→ready()`(plugin.test.ts AC-GS1/AC-GS2/AC-GS3)、
 * `createCannedGenerationProvider()`(model-gateway 的 PF1 canned provider)。
 * 這裡不 mock 任何接縫:注入的 provider 走的是 `GenerationServiceOptions.generation`,
 * 與 service.test.ts 注入 spy／rogue provider 的同一個縫。
 *
 * `answer()` 從 `app.retrieval` 拿 hits 屬於 phase-2(I2),本檔不碰檢索。
 */
import { Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import Fastify from "fastify";
import type { KmWorld } from "./_world.js";

import { generationPlugin } from "../../services/generation/src/plugin.js";
import {
  createGenerationService,
  type GenerationAnswer,
  type GenerationService,
} from "../../services/generation/src/service.js";
import { createCannedGenerationProvider } from "../../services/model-gateway/src/generation/canned.provider.js";
import type {
  ContextChunk,
  GenerateInput,
  GenerateResult,
  GenerationProvider,
} from "../../services/model-gateway/src/generation/provider.js";
import type { RetrievalHit } from "../../services/retrieval/src/vector/store.js";

const BEARING_PASSAGE = "軸承過熱應先停機並記錄運轉時數";
const LUBRICATION_PASSAGE = "潤滑油每運轉兩千小時更換一次";
/** 原始文件全文:passage 的 offsets 指向這裡,不是指向 passage 自己 */
const MAINTENANCE_DOC = `泵浦異常處理程序。${BEARING_PASSAGE}。${LUBRICATION_PASSAGE}。`;
const MAINTENANCE_DOC_ID = "doc-maintenance-001";
const DEPARTMENT_LABEL = "dept:maintenance";
/** service.ts 空 context 短路那條路徑目前產生的使用者可見文字(釘住,防無聲漂移) */
const NOTHING_TO_CITE_PREFIX = "沒有可引用的來源,無法回答:";

interface GenerationState {
  service: GenerationService;
  /** 已授權、已檢索完的 context —— 這個能力只收,不自己檢索 */
  context: RetrievalHit[];
  /** documentId → 原始文件全文 */
  docs: Map<string, string>;
  answer?: GenerationAnswer;
  /** 回答模型實際收到的 context(由記錄型 provider 填) */
  seenByModel?: readonly ContextChunk[];
}

function state(world: KmWorld): GenerationState {
  const s = world.bag["generation"] as GenerationState | undefined;
  assert.ok(s, "Background 尚未準備任何已授權的 context");
  return s;
}

function passage(fullText: string, text: string, index: number, scopeKey: string): RetrievalHit {
  const startOffset = fullText.indexOf(text);
  assert.ok(startOffset >= 0, `fixture 錯誤:「${text}」不在原始文件裡`);
  return {
    chunkId: `${MAINTENANCE_DOC_ID}#${index}`,
    documentId: MAINTENANCE_DOC_ID,
    text,
    startOffset,
    endOffset: startOffset + text.length,
    scopeKey,
    score: 0.93 - index * 0.1,
  };
}

/**
 * 真的 canned provider,外面包一層記錄:呼叫進 `world.providerCalls`
 * (component 前綴 "generation",給通用步驟「the "generation" provider is never
 * called」比對),收到的 context 進 `seenByModel`。回答與引用完全由 canned
 * provider 自己算,這一層不改任何輸出。
 */
function recordingCannedProvider(world: KmWorld): GenerationProvider {
  const inner = createCannedGenerationProvider();
  return {
    name: inner.name,
    model: inner.model,
    fidelityCeiling: inner.fidelityCeiling,
    async generate(input: GenerateInput): Promise<GenerateResult> {
      world.providerCalls.push({ component: "generation:canned", detail: input.question });
      state(world).seenByModel = input.context;
      return inner.generate(input);
    },
  };
}

/**
 * 與 service.test.ts AC2 同一個 rogue provider:回一條真的引用(所以「把壞的那條濾掉」的
 * 實作仍會回傳這一條)加一條捏造的來源。整個回應應該被拒絕,不是被過濾。
 */
function fabricatingProvider(world: KmWorld): GenerationProvider {
  return {
    name: "fake",
    model: "generation:rogue",
    fidelityCeiling: "PF1",
    async generate(input: GenerateInput): Promise<GenerateResult> {
      world.providerCalls.push({ component: "generation:rogue", detail: input.question });
      const real = input.context[0]!;
      return {
        answer: "看起來正常的回答,其實引用被捏造",
        citations: [
          {
            chunkId: real.chunkId,
            documentId: real.documentId,
            startOffset: real.startOffset,
            endOffset: real.endOffset,
          },
          { chunkId: "doc-does-not-exist#0", documentId: "doc-does-not-exist", startOffset: 0, endOffset: 1 },
        ],
        model: "generation:rogue",
      };
    },
  };
}

// ---------------------------------------------------------------- Given

Given(
  "a person's authorised context holds one bearing passage and one lubrication passage",
  function (this: KmWorld) {
    const docs = new Map<string, string>([[MAINTENANCE_DOC_ID, MAINTENANCE_DOC]]);
    const context = [
      passage(MAINTENANCE_DOC, BEARING_PASSAGE, 0, DEPARTMENT_LABEL),
      passage(MAINTENANCE_DOC, LUBRICATION_PASSAGE, 1, DEPARTMENT_LABEL),
    ];
    this.bag["generation"] = {
      service: createGenerationService({ generation: recordingCannedProvider(this) }),
      context,
      docs,
    } satisfies GenerationState;
  },
);

Given("the answering model fabricates one extra source alongside a real one", function (this: KmWorld) {
  state(this).service = createGenerationService({ generation: fabricatingProvider(this) });
});

// ---------------------------------------------------------------- When

async function ask(world: KmWorld, question: string, context: readonly RetrievalHit[]): Promise<void> {
  const s = state(world);
  try {
    s.answer = await s.service.answer(question, context);
    world.lastResult = s.answer;
  } catch (error) {
    world.lastError = error as Error;
    s.answer = undefined;
  }
}

/**
 * 自己的註冊步驟,而不是通用的「the {string} plugin is registered on a bare server…」:
 * 那句通用步驟的 cucumber expression 帶一個 {string},但它的 handler 宣告 0 個參數,
 * cucumber 直接報 "function has 0 arguments, should have 1"(2026-09-04 實測)。
 * common.steps.ts 是協調者的檔,不由本工單修——見 FEATURE.md「待協調」。
 * 這裡照 06-retrieval 的既有樣式自己註冊,仍走真實 register()→ready(),
 * 並把父實例放進 this.bag["registeredApp"],讓通用的可見性斷言照常適用(ADR 0007 §5)。
 */
When(
  "the generation plugin is registered on a fresh server and the server becomes ready",
  { timeout: 30_000 },
  async function (this: KmWorld) {
    const instance = Fastify({ logger: false });
    // plugin.ts 的零參數預設接線(plugin.test.ts AC-GS3 走的那條),不注入任何 service。
    await instance.register(generationPlugin);
    await instance.ready();
    this.bag["registeredApp"] = instance;
  },
);

When("the person asks {string} over that context", async function (this: KmWorld, question: string) {
  await ask(this, question, state(this).context);
});

When("the person asks {string} with an empty context", async function (this: KmWorld, question: string) {
  await ask(this, question, []);
});

When(
  "the person asks {string} through the generation seam on the parent instance",
  async function (this: KmWorld, question: string) {
    const s = state(this);
    const app = this.bag["registeredApp"] as { generation?: GenerationService } | undefined;
    assert.ok(app?.generation, "app.generation 在父實例上不可見——先跑註冊那句通用步驟");
    s.answer = await app.generation.answer(question, s.context);
    this.lastResult = s.answer;
  },
);

// ---------------------------------------------------------------- Then

function answerOf(world: KmWorld): GenerationAnswer {
  const s = state(world);
  assert.ok(
    s.answer,
    `沒有產生任何回答(可能被拒絕:${world.lastError?.name} ${world.lastError?.message})`,
  );
  return s.answer;
}

Then("every citation names a passage that was in the context", function (this: KmWorld) {
  const s = state(this);
  const supplied = new Set(s.context.map((c) => c.chunkId));
  const citations = answerOf(this).citations;
  assert.ok(citations.length > 0, "一段有來源的回答不該一條引用都沒有");
  for (const citation of citations) {
    assert.ok(
      supplied.has(citation.chunkId),
      `引用了不在 context 內的 chunk:${citation.chunkId}(context 只有 ${[...supplied].join(", ")})`,
    );
  }
});

Then("the citation for the bearing passage repeats its document and offsets unchanged", function (this: KmWorld) {
  const s = state(this);
  const bearing = s.context[0]!;
  const citation = answerOf(this).citations.find((c) => c.chunkId === bearing.chunkId);
  assert.ok(citation, `回答沒有引用 ${bearing.chunkId}`);
  assert.deepEqual(
    {
      chunkId: citation.chunkId,
      documentId: citation.documentId,
      startOffset: citation.startOffset,
      endOffset: citation.endOffset,
    },
    {
      chunkId: bearing.chunkId,
      documentId: bearing.documentId,
      startOffset: bearing.startOffset,
      endOffset: bearing.endOffset,
    },
    `引用的 document/offsets 與 context 裡那段不同:` +
      `citation=${citation.documentId}[${citation.startOffset},${citation.endOffset}] ` +
      `context=${bearing.documentId}[${bearing.startOffset},${bearing.endOffset}]`,
  );
});

Then(
  "slicing the original maintenance document by that citation's offsets gives the passage text",
  function (this: KmWorld) {
    const s = state(this);
    const bearing = s.context[0]!;
    const citation = answerOf(this).citations.find((c) => c.chunkId === bearing.chunkId);
    assert.ok(citation, `回答沒有引用 ${bearing.chunkId}`);
    const doc = s.docs.get(citation.documentId);
    assert.ok(doc, `找不到 ${citation.documentId} 的原始文件`);
    assert.equal(
      doc.slice(citation.startOffset, citation.endOffset),
      bearing.text,
      `offsets ${citation.startOffset}–${citation.endOffset} 切出的是「${doc.slice(citation.startOffset, citation.endOffset)}」,` +
        `不是引用的那段「${bearing.text}」——引用點不回原文`,
    );
  },
);

Then("no generated answer is handed back at all", function (this: KmWorld) {
  assert.equal(
    state(this).answer,
    undefined,
    `整個回應應該被拒絕,但仍拿到了答案:${JSON.stringify(state(this).answer)}`,
  );
});

Then("no department label reached the answering model", function (this: KmWorld) {
  const seen = state(this).seenByModel;
  assert.ok(seen, "回答模型沒有被呼叫,無從檢查它收到什麼");
  for (const chunk of seen) {
    const serialised = JSON.stringify(chunk);
    assert.ok(
      !Object.prototype.hasOwnProperty.call(chunk, "scopeKey") && !serialised.includes(DEPARTMENT_LABEL),
      `context chunk ${chunk.chunkId} 帶著部門標籤到達回答模型:${serialised}`,
    );
  }
});

Then("the answering model received the bearing passage's text and offsets unchanged", function (this: KmWorld) {
  const s = state(this);
  const seen = s.seenByModel;
  assert.ok(seen, "回答模型沒有被呼叫,無從檢查它收到什麼");
  const bearing = s.context[0]!;
  const forwarded = seen.find((c) => c.chunkId === bearing.chunkId);
  assert.ok(forwarded, `回答模型沒有收到 ${bearing.chunkId}`);
  assert.deepEqual(
    { text: forwarded.text, startOffset: forwarded.startOffset, endOffset: forwarded.endOffset },
    { text: bearing.text, startOffset: bearing.startOffset, endOffset: bearing.endOffset },
    `送到回答模型的那段與 context 裡的不同:` +
      `送出「${forwarded.text}」[${forwarded.startOffset},${forwarded.endOffset}],` +
      `原本是「${bearing.text}」[${bearing.startOffset},${bearing.endOffset}]`,
  );
});

Then("the answer says there is nothing to cite and carries no citation", function (this: KmWorld) {
  const result = answerOf(this);
  assert.deepEqual(result.citations, [], `沒有來源時不該有任何引用:${JSON.stringify(result.citations)}`);
  assert.ok(
    result.answer.startsWith(NOTHING_TO_CITE_PREFIX),
    `空 context 的答案文字漂移了:實際「${result.answer}」,應以「${NOTHING_TO_CITE_PREFIX}」開頭`,
  );
});
