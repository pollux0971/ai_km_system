import { describe, expect, it } from "vitest";
import {
  createMockAuthClient,
  MOCK_MAINTENANCE_USER_ID,
  MOCK_MAINTENANCE_USERNAME,
  MOCK_SALES_USER_ID,
  MOCK_SALES_USERNAME,
  MOCK_VALID_PASSWORD,
  MOCK_VALID_USERNAME,
} from "./mock";

describe("createMockAuthClient", () => {
  it("succeeds for the documented valid credentials", async () => {
    const client = createMockAuthClient();

    const result = await client.login({ username: MOCK_VALID_USERNAME, password: MOCK_VALID_PASSWORD });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.userId).toBeTruthy();
      expect(result.value.roles).toContain("general_user");
    }
  });

  it("succeeds for the demo-maintenance account with the maintenance_engineer role", async () => {
    const client = createMockAuthClient();

    const result = await client.login({ username: MOCK_MAINTENANCE_USERNAME, password: MOCK_VALID_PASSWORD });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.userId).toBe(MOCK_MAINTENANCE_USER_ID);
      expect(result.value.roles).toEqual(["maintenance_engineer"]);
    }
  });

  it("succeeds for the demo-sales account with the sales_purchasing role", async () => {
    const client = createMockAuthClient();

    const result = await client.login({ username: MOCK_SALES_USERNAME, password: MOCK_VALID_PASSWORD });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.userId).toBe(MOCK_SALES_USER_ID);
      expect(result.value.roles).toEqual(["sales_purchasing"]);
    }
  });

  it("rejects an unrecognized username/password pair as INVALID_CREDENTIALS", async () => {
    const client = createMockAuthClient();

    const result = await client.login({ username: "someone-else", password: "wrong" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CREDENTIALS");
    }
  });

  it("rejects the valid username with a wrong password as INVALID_CREDENTIALS (no partial auth)", async () => {
    const client = createMockAuthClient();

    const result = await client.login({ username: MOCK_VALID_USERNAME, password: "not-the-right-password" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CREDENTIALS");
    }
  });

  it("classifies the disabled-account trigger as ACCOUNT_DISABLED, not INVALID_CREDENTIALS", async () => {
    const client = createMockAuthClient();

    const result = await client.login({ username: "disabled", password: "irrelevant" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ACCOUNT_DISABLED");
    }
  });

  it("classifies the service-error trigger as SERVICE_UNAVAILABLE, not silently as success", async () => {
    const client = createMockAuthClient();

    const result = await client.login({ username: "service-error", password: "irrelevant" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SERVICE_UNAVAILABLE");
    }
  });

  it("never includes the raw password anywhere in a login response", async () => {
    const client = createMockAuthClient();

    const result = await client.login({ username: MOCK_VALID_USERNAME, password: MOCK_VALID_PASSWORD });

    expect(JSON.stringify(result)).not.toContain(MOCK_VALID_PASSWORD);
  });

  it("getSession reflects the session established by a successful login", async () => {
    const client = createMockAuthClient();
    await client.login({ username: MOCK_VALID_USERNAME, password: MOCK_VALID_PASSWORD });

    const session = await client.getSession();

    expect(session.ok).toBe(true);
    if (session.ok) {
      expect(session.value?.userId).toBeTruthy();
    }
  });

  it("getSession returns null before any login", async () => {
    const client = createMockAuthClient();

    const session = await client.getSession();

    expect(session).toEqual({ ok: true, value: null });
  });

  it("logout clears the session established by login", async () => {
    const client = createMockAuthClient();
    await client.login({ username: MOCK_VALID_USERNAME, password: MOCK_VALID_PASSWORD });

    const logoutResult = await client.logout();
    const session = await client.getSession();

    expect(logoutResult).toEqual({ ok: true, value: undefined });
    expect(session).toEqual({ ok: true, value: null });
  });
});
