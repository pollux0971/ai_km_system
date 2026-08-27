import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

const BASE = { NODE_ENV: "test" } as NodeJS.ProcessEnv;

describe("loadConfig (E04-S039)", () => {
  it("applies the ADR 0003 defaults when nothing is set", () => {
    const c = loadConfig({ ...BASE });
    expect(c.host).toBe("127.0.0.1");
    expect(c.port).toBe(4000);
    expect(c.dbPath).toBe("./data/ai-km.sqlite");
    expect(c.corsOrigins).toEqual([]);
    expect(c.devTriggers).toBe(false);
    expect(c.testSandbox).toBe(false);
    expect(c.asrProvider).toBe("whisper-server");
    expect(c.asrServerUrl).toBe("http://127.0.0.1:8178");
  });

  it("binds loopback by default so the API is not exposed by accident", () => {
    expect(loadConfig({ ...BASE }).host).toBe("127.0.0.1");
  });

  it("reads every documented variable", () => {
    const c = loadConfig({
      ...BASE,
      AI_KM_API_HOST: "0.0.0.0",
      AI_KM_API_PORT: "4100",
      AI_KM_DB_PATH: "/tmp/x.sqlite",
      AI_KM_CORS_ORIGINS: "https://a.example, https://b.example",
      AI_KM_DEV_TRIGGERS: "true",
      AI_KM_TEST_SANDBOX: "true",
      AI_KM_ASR_PROVIDER: "fake",
      AI_KM_ASR_SERVER_URL: "http://127.0.0.1:9999",
      AI_KM_LOG_LEVEL: "debug",
    });
    expect(c).toMatchObject({
      host: "0.0.0.0",
      port: 4100,
      dbPath: "/tmp/x.sqlite",
      corsOrigins: ["https://a.example", "https://b.example"],
      devTriggers: true,
      testSandbox: true,
      asrProvider: "fake",
      asrServerUrl: "http://127.0.0.1:9999",
      logLevel: "debug",
    });
  });

  it.each([
    ["AI_KM_API_PORT", "not-a-number"],
    ["AI_KM_API_PORT", "0"],
    ["AI_KM_API_PORT", "70000"],
    ["AI_KM_ASR_PROVIDER", "openai"],
    ["AI_KM_LOG_LEVEL", "chatty"],
    ["AI_KM_DEV_TRIGGERS", "yes-please"],
    ["AI_KM_ASR_SERVER_URL", "not-a-url"],
  ])("rejects an invalid %s=%s rather than silently defaulting", (key, value) => {
    expect(() => loadConfig({ ...BASE, [key]: value })).toThrow(ConfigError);
  });

  it("names the offending variable in the error, so startup failure is diagnosable", () => {
    expect(() => loadConfig({ ...BASE, AI_KM_API_PORT: "abc" })).toThrow(/AI_KM_API_PORT/);
  });

  // AC6 / Security AC — fail closed.
  it("refuses production + AI_KM_TEST_SANDBOX=true", () => {
    expect(() => loadConfig({ NODE_ENV: "production", AI_KM_TEST_SANDBOX: "true" })).toThrow(
      /AI_KM_TEST_SANDBOX/,
    );
  });

  it("refuses production + AI_KM_DEV_TRIGGERS=true", () => {
    expect(() => loadConfig({ NODE_ENV: "production", AI_KM_DEV_TRIGGERS: "true" })).toThrow(
      /AI_KM_DEV_TRIGGERS/,
    );
  });

  it("allows both flags outside production", () => {
    expect(() =>
      loadConfig({ NODE_ENV: "development", AI_KM_TEST_SANDBOX: "true", AI_KM_DEV_TRIGGERS: "true" }),
    ).not.toThrow();
  });

  it("treats an unset NODE_ENV as development, never as production", () => {
    expect(loadConfig({}).nodeEnv).toBe("development");
  });
});
