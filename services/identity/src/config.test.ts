import { describe, expect, it } from "vitest";
import { IdentityConfigError, loadIdentityConfig } from "./config.js";

describe("loadIdentityConfig", () => {
  it("defaults to development with every flag off except seeding", () => {
    const config = loadIdentityConfig({});
    expect(config.nodeEnv).toBe("development");
    expect(config.devTriggers).toBe(false);
    expect(config.testSandbox).toBe(false);
    expect(config.seedDemoUsers).toBe(true);
  });

  it("treats an unrecognised NODE_ENV as development, never production", () => {
    expect(loadIdentityConfig({ NODE_ENV: "staging" }).nodeEnv).toBe("development");
  });

  it("defaults seedDemoUsers to false in production", () => {
    expect(loadIdentityConfig({ NODE_ENV: "production" }).seedDemoUsers).toBe(false);
  });

  it("defaults seedDemoUsers to true in test", () => {
    expect(loadIdentityConfig({ NODE_ENV: "test" }).seedDemoUsers).toBe(true);
  });

  it("accepts explicit true/false for every boolean flag", () => {
    const config = loadIdentityConfig({
      AI_KM_DEV_TRIGGERS: "true",
      AI_KM_TEST_SANDBOX: "true",
      AI_KM_SEED_DEMO_USERS: "false",
    });
    expect(config.devTriggers).toBe(true);
    expect(config.testSandbox).toBe(true);
    expect(config.seedDemoUsers).toBe(false);
  });

  it("rejects a non-boolean value instead of silently falling back", () => {
    expect(() => loadIdentityConfig({ AI_KM_DEV_TRIGGERS: "yes" })).toThrow(IdentityConfigError);
  });

  it("refuses to start with AI_KM_DEV_TRIGGERS=true in production", () => {
    expect(() =>
      loadIdentityConfig({ NODE_ENV: "production", AI_KM_DEV_TRIGGERS: "true" }),
    ).toThrow(/production/i);
  });

  it("refuses to start with AI_KM_TEST_SANDBOX=true in production", () => {
    expect(() =>
      loadIdentityConfig({ NODE_ENV: "production", AI_KM_TEST_SANDBOX: "true" }),
    ).toThrow(/production/i);
  });

  it("refuses to start with AI_KM_SEED_DEMO_USERS=true in production", () => {
    expect(() =>
      loadIdentityConfig({ NODE_ENV: "production", AI_KM_SEED_DEMO_USERS: "true" }),
    ).toThrow(/production/i);
  });

  it("freezes the returned config", () => {
    expect(Object.isFrozen(loadIdentityConfig({}))).toBe(true);
  });
});
