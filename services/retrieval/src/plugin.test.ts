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
import { createInMemoryVectorStore } from "./vector/store.js";
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
    const service = createRetrievalService({ store, embedding });
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
});
