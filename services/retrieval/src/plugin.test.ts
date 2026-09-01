/**
 * `retrievalPlugin` wiring (policy L2 seam). No PF tag: no provider involved.
 *
 * Every assertion here goes through a REAL `register()` / `ready()`, which is
 * the only path that can see plugin encapsulation — **ADR 0007 §5**.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { retrievalPlugin } from "./plugin.js";
import { RetrievalNotImplementedError, type RetrievalService } from "./service.js";

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

describe("retrievalPlugin (E04-S058 scaffold)", () => {
  it("AC-RS1 ★ app.retrieval 對 SIBLING 可見——in-process 接縫的前提（ADR 0007 §4）", async () => {
    app = await build();
    expect(seam(app), "decoration must escape the plugin's encapsulation context").toBeDefined();
    expect(seam(app)?.componentId).toBe("retrieval:scaffold");
  });

  it("AC-RS2 空殼呼叫必須拋錯,不得回傳空陣列", async () => {
    app = await build();
    await expect(seam(app)!.retrieve()).rejects.toBeInstanceOf(RetrievalNotImplementedError);
  });

  it("AC-RS3 錯誤訊息要指出由哪些 story 補上實作,而不是只說「未實作」", async () => {
    app = await build();
    await expect(seam(app)!.retrieve()).rejects.toThrow(/E04-S060.*E04-S061.*E04-S062/s);
  });

  it("AC-RS4 可注入替代實作——E04-S062 之後就是從這裡接進來", async () => {
    const injected: RetrievalService = {
      componentId: "retrieval:injected",
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
