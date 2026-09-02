/**
 * `retrievalPlugin` wiring (policy L2 seam). No PF tag on the wiring itself:
 * these tests only check decoration/visibility and that the default service
 * shape is genuinely wired up, not what grade of evidence its answers carry.
 *
 * Every assertion here goes through a REAL `register()` / `ready()`, which is
 * the only path that can see plugin encapsulation — **ADR 0007 §5**.
 *
 * E04-S058 → E04-S062: the default decorated service used to be a scaffold
 * that always threw `RetrievalNotImplementedError`; AC-RS2/AC-RS3 tested
 * exactly that throw and its error message. E04-S062 replaces the scaffold
 * with the real service (`service.ts`), so those two tests are rewritten
 * here to assert the equivalent real behaviour instead of a throw that no
 * longer happens. AC-RS1 and AC-RS4 (visibility, injectability) are
 * unchanged in substance — they never depended on the scaffold's throwing
 * behaviour.
 *
 * AC-RS3 REJECTED AND REWRITTEN (review round 2, same day): the first
 * version queried the plugin's zero-arg default wiring, which builds an
 * always-empty in-memory store with no way to put data into it from
 * `RetrievalPluginOptions`. `store.query()` on an empty store returns `[]`
 * regardless of whether the scope predicate ran at all, so that version
 * could not distinguish "Deny-Wins enforced" from "Deny-Wins deleted
 * entirely" — an existence assertion against a result that can never be
 * non-empty, the exact shape `.claude/rules/STORY_WORKFLOW.md`'s new rule
 * (commit 54561aa, same day) names. The reviewer proved this by deleting
 * `vector/store.ts`'s pre-filter AND both `assertNoScopeLeak` call sites
 * (store layer and service layer) and re-running: the old AC-RS2/AC-RS3
 * stayed green while `service.test.ts` caught the damage. The fix below
 * builds a real `RetrievalService` (via `createRetrievalService`, the exact
 * function the plugin's default uses) over a store PRE-SEEDED with one
 * scoped record, injects it the way AC-RS4 already does, and asserts a
 * result that actually depends on the scope argument: the authorised
 * caller gets the hit, a differently-scoped caller gets nothing. See this
 * story's EVIDENCE for the reverse-verification proving THIS version does
 * go red under the same deletion.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { retrievalPlugin } from "./plugin.js";
import { createRetrievalService, createModelGatewayEmbeddingProvider, type RetrievalService } from "./service.js";
import { createInMemoryVectorStore, EmbeddingVersionMismatchError } from "./vector/store.js";
import { toRetrievalScope } from "./authorization/scope.js";

const scope = toRetrievalScope({ principalId: "u-1", allowedScopeKeys: ["dept:maintenance"] });

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function build(): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  await instance.register(retrievalPlugin);
  await instance.ready();
  return instance;
}

function seam(instance: FastifyInstance): RetrievalService | undefined {
  return (instance as unknown as { retrieval?: RetrievalService }).retrieval;
}

describe("retrievalPlugin (E04-S062 — real service, no longer a scaffold)", () => {
  it("AC-RS1 ★ app.retrieval 對 SIBLING 可見——in-process 接縫的前提(ADR 0007 §4)", async () => {
    app = await build();
    expect(seam(app), "decoration must escape the plugin's encapsulation context").toBeDefined();
    expect(seam(app)?.componentId).toBe("retrieval:service");
  });

  it("AC-RS2 預設服務是真的可用——對空 store 檢索回傳空陣列,不再拋 RetrievalNotImplementedError", async () => {
    app = await build();
    const hits = await seam(app)!.retrieve("任何問題", scope, 3);
    expect(hits).toEqual([]);
  });

  it("AC-RS3 透過真實形狀的預設服務證明 Deny-Wins——store 裡確實有一筆 maintenance 資料,只有 maintenance scope 拿得到,finance scope 拿到的是空陣列而不是那一筆", async () => {
    const store = createInMemoryVectorStore();
    const embedding = createModelGatewayEmbeddingProvider();
    const [vector] = await embedding.embed(["軸承過熱應先停機並記錄運轉時數"]);
    await store.upsert([
      {
        chunkId: "doc-maintenance-001#0",
        documentId: "doc-maintenance-001",
        text: "軸承過熱應先停機並記錄運轉時數",
        startOffset: 0,
        endOffset: 15,
        scopeKey: "dept:maintenance",
        embedding: vector!,
      },
    ]);

    // Exactly the function `plugin.ts`'s own default wiring calls
    // (`createRetrievalService({})`), just with a pre-seeded store instead
    // of an empty one — so this exercises the real default SHAPE, not a
    // hand-rolled stub.
    const service = createRetrievalService({ store, embedding, enforceEmbeddingVersion: false });
    const instance = Fastify({ logger: false });
    await instance.register(retrievalPlugin, { service });
    await instance.ready();
    app = instance;

    const maintenance = toRetrievalScope({ principalId: "u-alice", allowedScopeKeys: ["dept:maintenance"] });
    const finance = toRetrievalScope({ principalId: "u-bob", allowedScopeKeys: ["dept:finance"] });

    const authorised = await seam(app)!.retrieve("軸承過熱", maintenance, 3);
    expect(authorised).toHaveLength(1);
    expect(authorised[0]!.scopeKey).toBe("dept:maintenance");

    // The result a DIFFERENT scope gets for the SAME question over the SAME
    // store is what the old version could never actually test: it must
    // differ from `authorised`, and specifically be empty — not merely "not
    // throw".
    const denied = await seam(app)!.retrieve("軸承過熱", finance, 3);
    expect(denied).toEqual([]);
  });

  it("AC-RS4 可注入替代實作", async () => {
    const injected: RetrievalService = {
      componentId: "retrieval:injected",
      fidelityCeiling: "PF0",
      async retrieve(): Promise<never> {
        throw new Error("injected");
      },
    };
    const instance = Fastify({ logger: false });
    await instance.register(retrievalPlugin, { service: injected });
    await instance.ready();
    app = instance;
    expect(seam(app)?.componentId).toBe("retrieval:injected");
  });

  it(
    "AC-RS5 (E06-S026) ★ plugin 的零 service 預設路徑真的打開版本比對——" +
      "透過 options.store(不是 options.service)注入一筆沒有身分欄位的資料," +
      "走真實 register()/ready() 的 app.retrieval 查詢必須被拒絕,而不是靜默排出結果",
    async () => {
      // 刻意不傳 `service` —— 這條路徑要走的正是 `plugin.ts` 自己那行
      // `createRetrievalService({ enforceEmbeddingVersion: true, ...store })`
      // 預設建構,只是把它原本內建、外部完全碰不到的空 store 換成這個測試能
      // 塞資料進去的 store(`options.store` 是為此新增的測試專用管道,見
      // `RetrievalPluginOptions.store` 的文件註解)。AC-RS3 特意繞過這條預設
      // 路徑(自己組一個完整 service 再注入);這一條剛好相反,要驗證的正是
      // 那條路徑本身。
      const store = createInMemoryVectorStore();
      const embedding = createModelGatewayEmbeddingProvider();
      const [vector] = await embedding.embed(["軸承過熱應先停機並記錄運轉時數"]);
      await store.upsert([
        {
          chunkId: "doc-maintenance-001#0",
          documentId: "doc-maintenance-001",
          text: "軸承過熱應先停機並記錄運轉時數",
          startOffset: 0,
          endOffset: 15,
          scopeKey: "dept:maintenance",
          embedding: vector!,
          // 刻意不設 embeddingModel/embeddingDimensions —— 模擬「這筆資料沒有
          // 記錄身分」(E06-S026 之前寫入的資料,或跳過 ingestion 直接寫入
          // store 的資料),這正是 AC5 要拒絕、不得當成相容的那種資料。
        },
      ]);

      const instance = Fastify({ logger: false });
      await instance.register(retrievalPlugin, { store });
      await instance.ready();
      app = instance;

      // 如果 `enforceEmbeddingVersion: true` 這個開關被拿掉(或這條路徑
      // 沒有真的接上它),這裡會 resolve 出真實命中的那筆資料而不是拋錯——
      // 斷言對著「有沒有被拒絕」,不是「有沒有拿到結果」,失敗訊息會帶著
      // 實際洩漏出來的資料值(見本 story EVIDENCE 的反向驗證記錄)。
      await expect(seam(app)!.retrieve("軸承過熱", scope, 3)).rejects.toBeInstanceOf(
        EmbeddingVersionMismatchError,
      );
    },
  );

  it(
    "AC-RS6 (E06-S026, 技術顧問 2026-09-02 review round 2) ★ 真正的身分不符" +
      "(不是缺失,兩邊都有身分,只是不一樣)透過同一條真實 register()/ready() " +
      "路徑一樣被拒絕,且錯誤訊息帶著兩邊實際的身分字串(值,不是存在性斷言)",
    async () => {
      // 與 AC-RS5 的差別:AC-RS5 是「完全沒有身分」(UNKNOWN 分支);這一條
      // 是「兩邊都宣告了身分,但不是同一個」——維度刻意設成相同
      // (`embedding.dimensions`,即 plugin 預設 embedding provider 會用的
      // 256),只有 model 字串不同,正是本 story 動機情境裡「維度相同、
      // 語意不同」那個維度檢查抓不到的危險案例(見 store.ts 的
      // `EmbeddingIdentity` 文件註解)。
      const store = createInMemoryVectorStore();
      // 與 plugin.ts 預設路徑會建構的 embedding provider 完全同款
      // (`createModelGatewayEmbeddingProvider()`,零參數),用它算出的
      // `.dimensions`/`.model` 才能保證「查詢身分」與這裡宣告的「索引身分」
      // 除了 model 字串以外逐項相同。
      const embedding = createModelGatewayEmbeddingProvider();
      const [vector] = await embedding.embed(["軸承過熱應先停機並記錄運轉時數"]);
      const STALE_MODEL = "embedding:legacy-v1";
      await store.upsert([
        {
          chunkId: "doc-maintenance-002#0",
          documentId: "doc-maintenance-002",
          text: "軸承過熱應先停機並記錄運轉時數",
          startOffset: 0,
          endOffset: 15,
          scopeKey: "dept:maintenance",
          embedding: vector!,
          // 刻意與 plugin 預設 provider 的 model("embedding:deterministic")
          // 不同,維度刻意相同——這是「換 provider 但維度剛好一樣」的情境。
          embeddingModel: STALE_MODEL,
          embeddingDimensions: embedding.dimensions,
        },
      ]);

      const instance = Fastify({ logger: false });
      await instance.register(retrievalPlugin, { store });
      await instance.ready();
      app = instance;

      let thrown: unknown;
      try {
        await seam(app)!.retrieve("軸承過熱", scope, 3);
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(EmbeddingVersionMismatchError);
      const message = (thrown as Error).message;
      // 值斷言,不是存在性斷言:訊息必須帶著兩邊「真正的身分字串」,不是
      // 「有沒有拋錯」——這正是本 story 獨立審核第二輪點名要修的落差。
      expect(message).toContain(STALE_MODEL);
      expect(message).toContain(embedding.model);
      expect(embedding.model).toBe("embedding:deterministic");
    },
  );
});
