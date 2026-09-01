/** `ingestionPlugin` wiring (policy L2 seam). Real register()/ready() — ADR 0007 §5. */
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { ingestionPlugin } from "./plugin.js";
import { IngestionNotImplementedError, type IngestionService } from "./service.js";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function build(service?: IngestionService): Promise<FastifyInstance> {
  const i = Fastify({ logger: false });
  await i.register(ingestionPlugin, service ? { service } : {});
  await i.ready();
  return i;
}

function seam(instance: FastifyInstance): IngestionService | undefined {
  return (instance as unknown as { ingestion?: IngestionService }).ingestion;
}

describe("ingestionPlugin (E06-S041 scaffold)", () => {
  it("AC-IS1 ★ app.ingestion 對 SIBLING 可見（ADR 0007 §4）", async () => {
    app = await build();
    expect(seam(app), "decoration must escape the plugin's encapsulation context").toBeDefined();
    expect(seam(app)?.componentId).toBe("ingestion:scaffold");
  });

  it("AC-IS2 空殼呼叫必須拋錯,不得回報「索引了 0 個 chunk」", async () => {
    app = await build();
    await expect(seam(app)!.ingest()).rejects.toBeInstanceOf(IngestionNotImplementedError);
  });

  it("AC-IS3 錯誤訊息要指出由 E06-S022/S008/S042 補上,並說明空字串的危害", async () => {
    app = await build();
    await expect(seam(app)!.ingest()).rejects.toThrow(/E06-S022[\s\S]*E06-S008[\s\S]*E06-S042[\s\S]*查無資料/);
  });

  it("AC-IS4 可注入替代實作", async () => {
    app = await build({
      componentId: "ingestion:injected",
      async ingest(): Promise<never> {
        throw new Error("injected");
      },
    });
    expect(seam(app)?.componentId).toBe("ingestion:injected");
  });
});
