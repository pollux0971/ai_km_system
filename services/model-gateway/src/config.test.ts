import { describe, expect, it } from "vitest";
import { assertProviderUsable, ModelGatewayConfigError, resolveModelGatewayConfig } from "./config.js";

const BASE = { nodeEnv: "development" as const, asrProvider: "whisper-server" as const, asrServerUrl: "http://127.0.0.1:8178" };

describe("resolveModelGatewayConfig", () => {
  it("regression: fake provider can start in development/test", () => {
    expect(() =>
      resolveModelGatewayConfig({ ...BASE, nodeEnv: "test", asrProvider: "fake" }),
    ).not.toThrow();
    expect(() =>
      resolveModelGatewayConfig({ ...BASE, nodeEnv: "development", asrProvider: "fake" }),
    ).not.toThrow();
  });

  it("refuses to start with fake provider + NODE_ENV=production", () => {
    expect(() =>
      resolveModelGatewayConfig({ ...BASE, nodeEnv: "production", asrProvider: "fake" }),
    ).toThrowError(ModelGatewayConfigError);
  });

  it("allows whisper-server provider in production (with a loopback URL)", () => {
    expect(() =>
      resolveModelGatewayConfig({ ...BASE, nodeEnv: "production", asrProvider: "whisper-server" }),
    ).not.toThrow();
  });

  it.each(["http://127.0.0.1:8178", "http://localhost:8178", "http://10.0.0.5:8178", "http://172.16.0.1:8178", "http://192.168.1.1:8178"])(
    "accepts a loopback/private asrServerUrl: %s",
    (asrServerUrl) => {
      expect(() => resolveModelGatewayConfig({ ...BASE, asrServerUrl })).not.toThrow();
    },
  );

  it.each(["http://8.8.8.8:8178", "http://example.com:8178", "http://1.2.3.4:8178", "http://172.32.0.1:8178"])(
    "refuses a public asrServerUrl (SSRF guard): %s",
    (asrServerUrl) => {
      expect(() => resolveModelGatewayConfig({ ...BASE, asrServerUrl })).toThrowError(
        ModelGatewayConfigError,
      );
    },
  );

  it("refuses a malformed asrServerUrl", () => {
    expect(() => resolveModelGatewayConfig({ ...BASE, asrServerUrl: "not a url" })).toThrowError(
      ModelGatewayConfigError,
    );
  });

  it("defaults fakeText when AI_KM_ASR_FAKE_TEXT is unset", () => {
    const config = resolveModelGatewayConfig(BASE, {});
    expect(config.fakeText).toContain("假結果");
  });

  it("uses AI_KM_ASR_FAKE_TEXT when set", () => {
    const config = resolveModelGatewayConfig(BASE, { AI_KM_ASR_FAKE_TEXT: "自訂假文字" });
    expect(config.fakeText).toBe("自訂假文字");
  });
});

describe("resolveModelGatewayConfig — embedding provider (E04-S088)", () => {
  it("defaults embeddingProvider to fake and embeddingServerUrl to undefined when unset", () => {
    const config = resolveModelGatewayConfig(BASE, {});
    expect(config.embeddingProvider).toBe("fake");
    expect(config.embeddingServerUrl).toBeUndefined();
    expect(config.embeddingDimensions).toBe(256);
  });

  it("options.embeddingProvider takes precedence over AI_KM_EMBEDDING_PROVIDER", () => {
    const config = resolveModelGatewayConfig(
      { ...BASE, embeddingProvider: "fake", embeddingServerUrl: "http://127.0.0.1:8181" },
      { AI_KM_EMBEDDING_PROVIDER: "llama-server" },
    );
    expect(config.embeddingProvider).toBe("fake");
  });

  it("reads AI_KM_EMBEDDING_PROVIDER / AI_KM_EMBEDDING_SERVER_URL from env when options omit them", () => {
    const config = resolveModelGatewayConfig(BASE, {
      AI_KM_EMBEDDING_PROVIDER: "llama-server",
      AI_KM_EMBEDDING_SERVER_URL: "http://127.0.0.1:8181",
    });
    expect(config.embeddingProvider).toBe("llama-server");
    expect(config.embeddingServerUrl).toBe("http://127.0.0.1:8181");
  });

  it("refuses an unrecognised AI_KM_EMBEDDING_PROVIDER value rather than silently defaulting to fake", () => {
    expect(() =>
      resolveModelGatewayConfig(BASE, { AI_KM_EMBEDDING_PROVIDER: "totally-made-up" }),
    ).toThrowError(ModelGatewayConfigError);
  });

  it("refuses llama-server without an embedding server URL (neither option nor env)", () => {
    expect(() =>
      resolveModelGatewayConfig(BASE, { AI_KM_EMBEDDING_PROVIDER: "llama-server" }),
    ).toThrowError(ModelGatewayConfigError);
  });

  it.each(["http://8.8.8.8:8181", "http://example.com:8181"])(
    "refuses a public AI_KM_EMBEDDING_SERVER_URL (same SSRF guard as ASR): %s",
    (embeddingServerUrl) => {
      expect(() =>
        resolveModelGatewayConfig(BASE, {
          AI_KM_EMBEDDING_PROVIDER: "llama-server",
          AI_KM_EMBEDDING_SERVER_URL: embeddingServerUrl,
        }),
      ).toThrowError(ModelGatewayConfigError);
    },
  );

  it("allows llama-server in production with a loopback embedding server URL", () => {
    expect(() =>
      resolveModelGatewayConfig(
        { ...BASE, nodeEnv: "production" },
        { AI_KM_EMBEDDING_PROVIDER: "llama-server", AI_KM_EMBEDDING_SERVER_URL: "http://127.0.0.1:8181" },
      ),
    ).not.toThrow();
  });

  it("embeddingDimensions default (256) is unrelated to and unaffected by choosing llama-server", () => {
    const config = resolveModelGatewayConfig(BASE, {
      AI_KM_EMBEDDING_PROVIDER: "llama-server",
      AI_KM_EMBEDDING_SERVER_URL: "http://127.0.0.1:8181",
    });
    // The deterministic placeholder's own default dimension count is
    // untouched by selecting the real provider — HttpEmbeddingProvider
    // reports its own 1024 independently (see http.provider.test.ts).
    expect(config.embeddingDimensions).toBe(256);
  });
});


describe("assertProviderUsable — checks the ACTUAL provider instance, not the declared string (E04-S088 follow-up)", () => {
  it("★ reverse-verification: declared llama-server but actual constructed provider is deterministic (fake) — must refuse, naming the mismatch", () => {
    // This is the EXACT bug the coordinator found: EmbeddingProviderChoice
    // grew "llama-server" as a legal declared value, but nothing forced the
    // thing actually constructed to match it. `actualProvider` here stands
    // in for what a regressed `plugin.ts` (one that ignores config.
    // embeddingProvider and always builds the deterministic placeholder)
    // would hand this function.
    let thrown: unknown;
    try {
      assertProviderUsable("development", "embedding", "llama-server", { name: "fake" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ModelGatewayConfigError);
    const message = (thrown as Error).message;
    // Decisive on CONTENT: the message must name the MISMATCH itself
    // (declared vs actual), not just "provider is fake" — a message that
    // only said the latter would be indistinguishable from the (unrelated)
    // production/fake guard below, and would not tell an operator that the
    // config string and the running code disagree.
    expect(message).toContain("llama-server");
    expect(message).toContain("fake");
    expect(message).toMatch(/宣告.*不符|不符.*宣告/);
  });

  it("refuses a declared/actual mismatch even OUTSIDE production (this is a wiring bug, not an environment choice)", () => {
    expect(() =>
      assertProviderUsable("test", "embedding", "llama-server", { name: "fake" }),
    ).toThrowError(ModelGatewayConfigError);
    expect(() =>
      assertProviderUsable("development", "generation", "fake", { name: "canned" }),
    ).toThrowError(ModelGatewayConfigError);
  });

  it("regression: matching declared/actual, non-fake, in production — allowed", () => {
    expect(() =>
      assertProviderUsable("production", "embedding", "llama-server", { name: "llama-server" }),
    ).not.toThrow();
  });

  it("regression: matching declared/actual fake in development/test — allowed", () => {
    expect(() =>
      assertProviderUsable("development", "embedding", "fake", { name: "fake" }),
    ).not.toThrow();
    expect(() =>
      assertProviderUsable("test", "generation", "fake", { name: "fake" }),
    ).not.toThrow();
  });

  it("regression: matching declared/actual fake in production is STILL refused (the original guard's job)", () => {
    expect(() =>
      assertProviderUsable("production", "embedding", "fake", { name: "fake" }),
    ).toThrowError(ModelGatewayConfigError);
  });
});
