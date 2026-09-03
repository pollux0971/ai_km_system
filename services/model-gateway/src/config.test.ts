import { describe, expect, it } from "vitest";
import { ModelGatewayConfigError, resolveModelGatewayConfig } from "./config.js";

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
