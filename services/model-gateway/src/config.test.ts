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
