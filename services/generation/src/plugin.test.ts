/**
 * `generationPlugin` wiring (policy L2 seam). No PF tag on the wiring itself:
 * these tests only check decoration/visibility and that the default service
 * shape is genuinely wired up, not what grade of evidence its answers carry.
 *
 * Every assertion here goes through a REAL `register()` / `ready()`, which is
 * the only path that can see plugin encapsulation — **ADR 0007 §5**.
 *
 * E04-S059 → E04-S063: the default decorated service used to be a scaffold
 * that always threw `GenerationNotImplementedError` from a zero-arg
 * `answer()`; AC-GS2/AC-GS3 tested exactly that throw and its error message.
 * E04-S063 replaces the scaffold with the real service (`service.ts`,
 * `answer(question, context)`), so those two tests are rewritten here to
 * assert the equivalent real behaviour instead of a throw — and a signature
 * — that no longer exist. AC-GS1 and AC-GS4 (visibility, injectability) are
 * unchanged in substance — they never depended on the scaffold's throwing
 * behaviour, only their bodies are updated for the new `answer()` arity.
 *
 * Following `services/retrieval/src/plugin.test.ts`'s AC-RS3 lesson (rejected
 * once for asserting "empty" against a result that could never be
 * non-empty): AC-GS3 below does not merely check that the default wiring
 * "does not throw" — it seeds a real context chunk and asserts the citation
 * that comes back names the SAME chunk with the SAME offsets, a value that
 * changes if generation, grounding, or the field projection breaks.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { generationPlugin } from "./plugin.js";
import { createGenerationService, type GenerationService } from "./service.js";
import type { RetrievalHit } from "@ai-km/service-retrieval/src/vector/store.js";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

function seam(instance: FastifyInstance): GenerationService | undefined {
  return (instance as unknown as { generation?: GenerationService }).generation;
}

async function build(): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  await instance.register(generationPlugin);
  await instance.ready();
  return instance;
}

const HIT: RetrievalHit = {
  chunkId: "doc-1#0",
  documentId: "doc-1",
  text: "泵浦於 8/12 更換軸封。",
  startOffset: 0,
  endOffset: 12,
  scopeKey: "dept:maintenance",
  score: 0.91,
};

describe("generationPlugin (E04-S063 — real service, no longer a scaffold)", () => {
  it("AC-GS1 ★ app.generation 對 SIBLING 可見（ADR 0007 §4）", async () => {
    app = await build();
    expect(seam(app), "decoration must escape the plugin's encapsulation context").toBeDefined();
    expect(seam(app)?.componentId).toBe("generation:service");
  });

  it("AC-GS2 預設服務是真的可用——空 context 回傳優雅空答案，不再拋 GenerationNotImplementedError", async () => {
    app = await build();
    const result = await seam(app)!.answer("任何問題", []);
    expect(result.citations).toEqual([]);
    expect(result.answer).toBe("沒有可引用的來源,無法回答:任何問題");
  });

  it("AC-GS3 透過真實形狀的預設服務證明有引用的回答——同一個 chunk、相同 offsets 回填到 citation", async () => {
    app = await build();
    const result = await seam(app)!.answer("泵浦維修紀錄", [HIT]);
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toEqual({
      chunkId: HIT.chunkId,
      documentId: HIT.documentId,
      startOffset: HIT.startOffset,
      endOffset: HIT.endOffset,
    });
  });

  it("AC-GS4 可注入替代實作", async () => {
    const injected: GenerationService = {
      componentId: "generation:injected",
      async answer(): Promise<never> {
        throw new Error("injected");
      },
    };
    const instance = Fastify({ logger: false });
    await instance.register(generationPlugin, { service: injected });
    await instance.ready();
    app = instance;
    expect(seam(app)?.componentId).toBe("generation:injected");
  });

  it("AC-GS5 注入的服務與 plugin 預設建構函式（createGenerationService）行為一致——雙重來源交叉檢查", async () => {
    // Exactly the function `plugin.ts`'s own default wiring calls
    // (`createGenerationService({})`), injected explicitly — proves the
    // plugin's zero-arg default is not a different, undertested shape.
    const service = createGenerationService({});
    const instance = Fastify({ logger: false });
    await instance.register(generationPlugin, { service });
    await instance.ready();
    app = instance;

    const result = await seam(app)!.answer("泵浦維修紀錄", [HIT]);
    expect(result.citations).toEqual([
      { chunkId: HIT.chunkId, documentId: HIT.documentId, startOffset: HIT.startOffset, endOffset: HIT.endOffset },
    ]);
  });
});
