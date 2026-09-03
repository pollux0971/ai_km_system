/**
 * Plugin-level wiring (policy L2 seam).
 *
 * The route tests mount handlers directly, so they cannot see plugin
 * encapsulation. This file registers the REAL plugin the way `apps/api` does
 * and asserts what a SIBLING plugin would see — which is the only thing that
 * matters for the in-process seam.
 */
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { modelGatewayPlugin, type ModelGatewayOptions } from "./plugin.js";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function build(
  specNames: string[],
  overrides: Partial<ModelGatewayOptions> = {},
): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  instance.decorate("requireSession", async function requireSession(request: FastifyRequest) {
    Object.assign(request, { auth: { userId: "u-test" } });
  });
  instance.decorate("contracts", { specNames: () => specNames });
  await instance.register(modelGatewayPlugin, {
    nodeEnv: "test",
    asrProvider: "fake",
    asrServerUrl: "http://127.0.0.1:8080",
    ...overrides,
  });
  await instance.ready();
  return instance;
}

describe("modelGatewayPlugin", () => {
  it("AC-P1 ★ app.modelGateway 對 SIBLING 可見——in-process 接縫的前提", async () => {
    app = await build(["embedding", "generation"]);
    const gateway = (app as unknown as { modelGateway?: { embed: unknown } }).modelGateway;
    expect(gateway, "decoration must escape the plugin's encapsulation context").toBeDefined();
    expect(typeof gateway?.embed).toBe("function");
  });

  it("AC-P2 in-process 呼叫可直接用,不需要經過 HTTP", async () => {
    app = await build(["embedding", "generation"]);
    const gateway = (app as unknown as {
      modelGateway: { embed(r: { input: string[] }, c: string): Promise<{ data: unknown[] }> };
    }).modelGateway;
    const result = await gateway.embed({ input: ["軸承過熱"] }, "cid");
    expect(result.data).toHaveLength(1);
  });

  it("AC-P3 契約未載入時,路由不註冊——404,不是 boot 時 500（E04-S049/S050 的教訓）", async () => {
    app = await build([]); // no specs loaded, as apps/api's test fixture does
    const embeddings = await app.inject({
      method: "POST", url: "/v1/embeddings", payload: { input: ["x"] },
    });
    const generate = await app.inject({
      method: "POST", url: "/v1/generate", payload: { question: "q", context: [] },
    });
    expect(embeddings.statusCode).toBe(404);
    expect(generate.statusCode).toBe(404);
  });

  it("AC-P4 只載入 embedding 契約時,只註冊 embeddings 路由", async () => {
    app = await build(["embedding"]);
    const embeddings = await app.inject({
      method: "POST", url: "/v1/embeddings", payload: { input: ["x"] },
    });
    const generate = await app.inject({
      method: "POST", url: "/v1/generate", payload: { question: "q", context: [] },
    });
    expect(embeddings.statusCode).toBe(200);
    expect(generate.statusCode).toBe(404);
  });

  it("AC-P5 transcriptions 路由維持無條件註冊,不受契約載入與否影響", async () => {
    app = await build([]);
    const res = await app.inject({ method: "POST", url: "/v1/transcriptions" });
    // 415 (not 404): the route exists and rejected the missing multipart body.
    expect(res.statusCode).toBe(415);
  });

  describe("AC-P6/P7 — embeddingProvider selection really constructs the declared provider (E04-S088 follow-up)", () => {
    it("AC-P6 ★ embeddingProvider=\"llama-server\" actually constructs HttpEmbeddingProvider — not the deterministic placeholder (decisive on the REAL provider identity, not just \"boot succeeded\")", async () => {
      app = await build(["embedding"], {
        embeddingProvider: "llama-server",
        embeddingServerUrl: "http://127.0.0.1:8181",
      });
      // `providers` is the gateway's own diagnostics surface (gateway.ts) —
      // reading it here is exactly how a regression (declare llama-server,
      // build deterministic) would have been caught BEFORE this follow-up:
      // it exposes what was actually constructed, not what was configured.
      const gateway = (app as unknown as {
        modelGateway: { providers: { embedding: { name: string; model: string; fidelityCeiling: string } } };
      }).modelGateway;
      expect(gateway.providers.embedding.name).toBe("llama-server");
      expect(gateway.providers.embedding.model).toBe("bge-m3");
      expect(gateway.providers.embedding.fidelityCeiling).toBe("PF2");
    });

    it("AC-P6b regression: embeddingProvider unset (default \"fake\") still constructs the deterministic placeholder", async () => {
      app = await build(["embedding"]);
      const gateway = (app as unknown as {
        modelGateway: { providers: { embedding: { name: string; model: string } } };
      }).modelGateway;
      expect(gateway.providers.embedding.name).toBe("fake");
      expect(gateway.providers.embedding.model).toBe("embedding:deterministic");
    });

    it("AC-P7 refuses to boot when embeddingProvider=\"llama-server\" is declared without an embeddingServerUrl — never silently falls back to the placeholder", async () => {
      const instance = Fastify({ logger: false });
      instance.decorate("requireSession", async function requireSession(request: FastifyRequest) {
        Object.assign(request, { auth: { userId: "u-test" } });
      });
      instance.decorate("contracts", { specNames: () => ["embedding"] });
      await expect(
        instance.register(modelGatewayPlugin, {
          nodeEnv: "test",
          asrProvider: "fake",
          asrServerUrl: "http://127.0.0.1:8080",
          embeddingProvider: "llama-server",
          // embeddingServerUrl deliberately omitted
        }),
      ).rejects.toThrow();
      await instance.close();
    });
  });
});
