import { describe, expect, it } from "vitest";
import { IdentityConfigError, loadIdentityConfig, parseLoginRateLimit } from "./config.js";

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

  it("defaults loginRateLimit to 5 per-username / 20 per-IP / 15 minutes", () => {
    expect(loadIdentityConfig({}).loginRateLimit).toEqual({
      perUsernameMaxFailures: 5,
      perIpMaxFailures: 20,
      windowMinutes: 15,
    });
  });

  it("reads AI_KM_LOGIN_RATE_LIMIT into loginRateLimit", () => {
    expect(
      loadIdentityConfig({ AI_KM_LOGIN_RATE_LIMIT: "perUsernameMaxFailures:2,perIpMaxFailures:3" })
        .loginRateLimit,
    ).toEqual({ perUsernameMaxFailures: 2, perIpMaxFailures: 3, windowMinutes: 15 });
  });
});

describe("parseLoginRateLimit (E02-S034 AC7)", () => {
  it("returns the defaults when unset", () => {
    expect(parseLoginRateLimit(undefined)).toEqual({
      perUsernameMaxFailures: 5,
      perIpMaxFailures: 20,
      windowMinutes: 15,
    });
  });

  it("returns the defaults for an empty string", () => {
    expect(parseLoginRateLimit("")).toEqual({
      perUsernameMaxFailures: 5,
      perIpMaxFailures: 20,
      windowMinutes: 15,
    });
  });

  it("overrides only the keys given, keeping the rest at default", () => {
    expect(parseLoginRateLimit("windowMinutes:1")).toEqual({
      perUsernameMaxFailures: 5,
      perIpMaxFailures: 20,
      windowMinutes: 1,
    });
  });

  it("overrides all three keys", () => {
    expect(parseLoginRateLimit("perUsernameMaxFailures:2,perIpMaxFailures:3,windowMinutes:1")).toEqual({
      perUsernameMaxFailures: 2,
      perIpMaxFailures: 3,
      windowMinutes: 1,
    });
  });

  it("tolerates whitespace around entries and around key:value", () => {
    expect(parseLoginRateLimit(" perUsernameMaxFailures : 2 , perIpMaxFailures:3 ")).toEqual({
      perUsernameMaxFailures: 2,
      perIpMaxFailures: 3,
      windowMinutes: 15,
    });
  });

  it("rejects an unknown key", () => {
    expect(() => parseLoginRateLimit("bogusKey:1")).toThrow(IdentityConfigError);
  });

  it("rejects a non-integer value", () => {
    expect(() => parseLoginRateLimit("perUsernameMaxFailures:2.5")).toThrow(IdentityConfigError);
  });

  it("rejects a zero or negative value", () => {
    expect(() => parseLoginRateLimit("perUsernameMaxFailures:0")).toThrow(IdentityConfigError);
    expect(() => parseLoginRateLimit("perUsernameMaxFailures:-1")).toThrow(IdentityConfigError);
  });

  it("rejects an entry with no colon", () => {
    expect(() => parseLoginRateLimit("perUsernameMaxFailures")).toThrow(IdentityConfigError);
  });

  it("rejects a non-numeric value", () => {
    expect(() => parseLoginRateLimit("perUsernameMaxFailures:abc")).toThrow(IdentityConfigError);
  });
});
