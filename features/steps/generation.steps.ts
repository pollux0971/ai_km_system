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

// ==================================================================
// phase-2(紅)—— services/generation 接進 apps/api composition root,
// answer() 真的從 app.retrieval 拿 hits(ADR 0014、07-generation/NEXT.md phase-2
// gate)。設計判斷 A/B 的完整推理寫在 phase-2.feature 檔頭,這裡只放實作。
//
// 每一步只呼叫今天已經存在的符號:KmWorld.startServer()(apps/api 真實
// buildServer())、GenerationAnswer(services/generation,phase-1 已在用的型別)。
// 沒有 import 任何新的實作符號——`app.rag` 是動態讀出來的(讀法 1 選的介面名字,
// 見 phase-2.feature 檔頭「設計判斷 A」),不是 import 的型別;`RetrievalServiceError`
// 只以字串比對錯誤名稱(不 import class 本身)。所以紅只會發生在斷言,不會發生在編譯。
// ==================================================================

interface RagSeamOutcome {
  seamPresent: boolean;
  answer?: GenerationAnswer;
  errorName?: string;
}

interface RagSeamState {
  outcome?: RagSeamOutcome;
  /** scenario 4:兩個真部門不同的人各自的結果,拿來比較是否一致 */
  outcomes?: Map<string, RagSeamOutcome>;
}

function ragSeamState(world: KmWorld): RagSeamState {
  const s = world.bag["ragSeam"] as RagSeamState | undefined;
  assert.ok(s, "When 尚未透過 composition root 的組合 seam 問過問題");
  return s;
}

/** 與 features/steps/retrieval.steps.ts 的 loginDemoPerson() 同一套登入流程,
 * 本檔獨立一份——NEXT.md「Gate 未滿足時」明講「不要 import 別的能力資料夾的
 * steps」,跨資料夾共用的登入流程是共用步驟的訊號,留給協調者搬進
 * common.steps.ts(見回報「待協調」)。 */
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
    `登入 ${username} 應成功(這一步只是確認 identity/session 沒壞,缺口專在 generation 沒被組合起來):實際 ${login.statusCode} ${login.body}`,
  );
}

/**
 * 讀法 1(見 phase-2.feature 檔頭):組合過的 seam 自己帶 ADR 0014 的固定
 * dept:eng,不對外收 scope 參數——這裡只呼叫它,不建它。今天 `app.rag` 在
 * 真實 buildServer() 上不存在,`seamPresent` 恆為 false。
 */
async function askThroughCombinedSeam(
  app: Awaited<ReturnType<KmWorld["startServer"]>>,
  question: string,
): Promise<RagSeamOutcome> {
  const seam = (app as unknown as { rag?: { ask?: (question: string) => Promise<GenerationAnswer> } }).rag;
  const outcome: RagSeamOutcome = { seamPresent: Boolean(seam?.ask) };
  if (seam?.ask) {
    try {
      outcome.answer = await seam.ask(question);
    } catch (error) {
      outcome.errorName = (error as Error).name;
    }
  }
  return outcome;
}

// ---------------------------------------------------------------- When

When(
  "a signed-in demo person tries to get a grounded answer to {string} through the real API server's own combined RAG seam",
  { timeout: 60_000 },
  async function (this: KmWorld, question: string) {
    const app = await this.startServer();
    await loginDemoPerson(app, "demo-user");
    const outcome = await askThroughCombinedSeam(app, question);
    this.bag["ragSeam"] = { outcome } satisfies RagSeamState;
  },
);

When(
  "two different demo people with different real departments each try to get a grounded answer to {string} through the real API server's own combined RAG seam",
  { timeout: 60_000 },
  async function (this: KmWorld, question: string) {
    const app = await this.startServer();
    const outcomes = new Map<string, RagSeamOutcome>();
    // demo-user(資訊部)與 demo-maintenance(維修部)——services/identity 的 fixture,
    // 與 06-retrieval/phase-2 的場景 4 同一組人。
    for (const username of ["demo-user", "demo-maintenance"]) {
      await loginDemoPerson(app, username);
      outcomes.set(username, await askThroughCombinedSeam(app, question));
    }
    const seamPresent = [...outcomes.values()].every((o) => o.seamPresent);
    this.bag["ragSeam"] = { outcome: { seamPresent }, outcomes } satisfies RagSeamState;
  },
);

// ---------------------------------------------------------------- Then

Then(
  "the combined RAG seam should be visible from the real server's parent instance, but it is not yet",
  function (this: KmWorld) {
    const s = ragSeamState(this);
    assert.ok(
      s.outcome?.seamPresent,
      "app.rag 在 apps/api 真實 buildServer() 的父實例上不存在——composition root 今天完全沒有把 " +
        "services/generation 組合進 retrieve() 之後(這一輪的產出,見 features/07-generation/NEXT.md " +
        "phase-2 與 phase-2.feature 檔頭「設計判斷 A」)。後果:即使一個人真的登入成功、" +
        "app.retrieval 與(接上後的)app.generation 各自都存在,也沒有任何生產碼把兩者接在一起—— " +
        "I2「登入問問題拿到答案」仍然斷在檢索與生成之間。修法:在 apps/api/src/server.ts 註冊 " +
        "generationPlugin(比照 retrievalPlugin 既有的無條件註冊樣式),並新增一個組合過的 " +
        "in-process 接縫,內部用 ADR 0014 的固定 dept:eng scope 呼叫 " +
        "app.retrieval.retrieve() 再把 hits 交給 app.generation.answer()。",
    );
  },
);

Then("the empty question should be rejected by the combined seam with {string}, not silently answered", function (this: KmWorld, errorName: string) {
  const s = ragSeamState(this);
  assert.ok(
    s.outcome?.errorName,
    "空問題應該在組合 seam 裡先被 retrieve() 既有的守門拒絕,但沒有任何錯誤被記錄下來(seam 不存在時這一步不會被執行到)",
  );
  assert.equal(s.outcome.errorName, errorName, `錯誤類型應為 ${errorName},實際 ${s.outcome.errorName}`);
});

Then("the answer should carry no citations, because nothing has been indexed yet", function (this: KmWorld) {
  const s = ragSeamState(this);
  assert.ok(s.outcome?.answer, "還沒有任何回答(seam 不存在時這一步不會被執行到)");
  assert.deepEqual(
    s.outcome.answer.citations,
    [],
    `今天還沒有任何資料被索引到 app.retrieval(05-ingestion/phase-2 是另一個資料夾的工作),組合 seam ` +
      `應該老實回報「沒有可引用的來源」,而不是帶著 ${JSON.stringify(s.outcome.answer.citations)} 這種` +
      `今天不該存在的引用——不索引不等於允許捏造。`,
  );
});

Then(
  "both people should get the exact same outcome from the combined seam, because I2's scope is fixed for everyone alike, not derived from either person's real department",
  function (this: KmWorld) {
    const s = ragSeamState(this);
    assert.ok(s.outcomes, "還沒有任何兩個人的比較結果");
    const a = s.outcomes.get("demo-user");
    const b = s.outcomes.get("demo-maintenance");
    assert.ok(a && b, "應該有 demo-user 與 demo-maintenance 兩個人的結果可以比較");
    assert.deepEqual(
      { citations: a.answer?.citations ?? null, answer: a.answer?.answer ?? null, error: a.errorName ?? null },
      { citations: b.answer?.citations ?? null, answer: b.answer?.answer ?? null, error: b.errorName ?? null },
      `demo-user(真部門「資訊部」)與 demo-maintenance(真部門「維修部」)透過同一個組合 seam 問同一個 ` +
        `問題,結果卻不一樣——ADR 0014 的固定值 dept:eng 應該讓每個人在 I2 期間得到完全相同的待遇, ` +
        `不管真部門是什麼。⚠️ 這條斷言在 apps/api 今天沒有 seed 通道時是弱斷言(store 永遠是空的,` +
        `兩人結果天生相同,見 phase-2.feature 檔頭「設計判斷 B」),但它仍然是 NEXT.md 明列的搬遷落點—— ` +
        `固定值必須真的活在生產碼裡,不能繼續只活在 step 檔。等 02-authorization phase-2(從身分推導 ` +
        `真 scope)真的落地、composition root 把這個固定值換掉之後,這條「應該相同」的斷言理當跟著紅, ` +
        `那正是這個場景故意設計成的移除條件(ADR 0014 Consequences)。看到它紅,代表有人動了固定值, ` +
        `該做的是照 02-authorization/phase-1.feature 的 @design-constraint 場景先例,把這條場景改寫成 ` +
        `新的事實,不是刪掉或放寬斷言。`,
    );
  },
);
