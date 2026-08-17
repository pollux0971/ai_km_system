import { beforeEach, describe, expect, it } from "vitest";
import { disableSso, enableSso, getSystemSettings } from "./system-settings";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("getSystemSettings (E11-S020)", () => {
  it("defaults to ssoEnabled: true, mirroring apps/web's own feature-flags.ts default", async () => {
    const result = await getSystemSettings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ ssoEnabled: true });
  });
});

describe("disableSso / enableSso (E11-S020)", () => {
  it("disableSso turns ssoEnabled off, and it's reflected by a later getSystemSettings", async () => {
    const disableResult = await disableSso();
    expect(disableResult.ok).toBe(true);
    if (!disableResult.ok) return;
    expect(disableResult.value.ssoEnabled).toBe(false);

    const getResult = await getSystemSettings();
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value.ssoEnabled).toBe(false);
  });

  it("enableSso turns ssoEnabled back on after a disable", async () => {
    await disableSso();

    const enableResult = await enableSso();
    expect(enableResult.ok).toBe(true);
    if (!enableResult.ok) return;
    expect(enableResult.value.ssoEnabled).toBe(true);

    const getResult = await getSystemSettings();
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value.ssoEnabled).toBe(true);
  });
});
