/** `generationPlugin` wiring (policy L2 seam). Real register()/ready() — ADR 0007 §5. */
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { generationPlugin } from "./plugin.js";
import { GenerationNotImplementedError, type GenerationService } from "./service.js";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

function seam(instance: FastifyInstance): GenerationService | undefined {
  return (instance as unknown as { generation?: GenerationService }).generation;
}

describe("generationPlugin (E04-S059 scaffold)", () => {
  it("AC-GS1 ★ app.generation 對 SIBLING 可見（ADR 0007 §4）", async () => {
    const i = Fastify({ logger: false });
    await i.register(generationPlugin);
    await i.ready();
    app = i;
    expect(seam(app), "decoration must escape the plugin's encapsulation context").toBeDefined();
    expect(seam(app)?.componentId).toBe("generation:scaffold");
  });

  it("AC-GS2 空殼呼叫必須拋錯,不得回傳無引用的答案", async () => {
    const i = Fastify({ logger: false });
    await i.register(generationPlugin);
    await i.ready();
    app = i;
    await expect(seam(app)!.answer()).rejects.toBeInstanceOf(GenerationNotImplementedError);
  });

  it("AC-GS3 錯誤訊息要指出由 E04-S063 補上,並說明為何不回空答案", async () => {
    const i = Fastify({ logger: false });
    await i.register(generationPlugin);
    await i.ready();
    app = i;
    await expect(seam(app)!.answer()).rejects.toThrow(/E04-S063[\s\S]*幻覺/);
  });

  it("AC-GS4 可注入替代實作", async () => {
    const injected: GenerationService = {
      componentId: "generation:injected",
      async answer(): Promise<never> {
        throw new Error("injected");
      },
    };
    const i = Fastify({ logger: false });
    await i.register(generationPlugin, { service: injected });
    await i.ready();
    app = i;
    expect(seam(app)?.componentId).toBe("generation:injected");
  });
});
