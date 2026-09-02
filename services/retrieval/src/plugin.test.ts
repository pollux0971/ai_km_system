/**
 * `retrievalPlugin` wiring (policy L2 seam). No PF tag on the wiring itself:
 * these tests only check decoration/visibility and that the default service
 * is genuinely wired up, not what grade of evidence its answers carry.
 *
 * Every assertion here goes through a REAL `register()` / `ready()`, which is
 * the only path that can see plugin encapsulation — **ADR 0007 §5**.
 *
 * E04-S058 → E04-S062: the default decorated service used to be a scaffold
 * that always threw `RetrievalNotImplementedError`; AC-RS2/AC-RS3 tested
 * exactly that throw and its error message. E04-S062 replaces the scaffold
 * with the real service (`service.ts`), so those two tests are rewritten
 * here to assert the equivalent real behaviour instead (the default service
 * actually answers, and Deny-Wins still holds through the plugin's default
 * wiring) rather than asserting a throw that no longer happens. AC-RS1 and
 * AC-RS4 (visibility, injectability) are unchanged in substance — they never
 * depended on the scaffold's throwing behaviour.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { retrievalPlugin } from "./plugin.js";
import { type RetrievalService } from "./service.js";
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

  it("AC-RS3 預設服務仍然 Deny-Wins——空授權範圍透過預設接線一樣回傳零筆而非拋錯", async () => {
    app = await build();
    const noAccess = toRetrievalScope({ principalId: "u-new", allowedScopeKeys: [] });
    const hits = await seam(app)!.retrieve("任何問題", noAccess, 3);
    expect(hits).toEqual([]);
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
