import { afterEach, describe, expect, it, vi } from "vitest";
import { isFeatureEnabled } from "./feature-flags";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isFeatureEnabled", () => {
  it("defaults sso to enabled when no env override is set", () => {
    expect(isFeatureEnabled("sso")).toBe(true);
  });

  it("disables sso when NEXT_PUBLIC_FEATURE_SSO=false is set", () => {
    vi.stubEnv("NEXT_PUBLIC_FEATURE_SSO", "false");

    expect(isFeatureEnabled("sso")).toBe(false);
  });

  it("keeps sso enabled when NEXT_PUBLIC_FEATURE_SSO=true is set explicitly", () => {
    vi.stubEnv("NEXT_PUBLIC_FEATURE_SSO", "true");

    expect(isFeatureEnabled("sso")).toBe(true);
  });

  it("falls back to the registered default for an unrecognized env value", () => {
    vi.stubEnv("NEXT_PUBLIC_FEATURE_SSO", "not-a-boolean");

    expect(isFeatureEnabled("sso")).toBe(true);
  });

  // E03-S041
  it("defaults voice_input to enabled when no env override is set", () => {
    expect(isFeatureEnabled("voice_input")).toBe(true);
  });

  it("disables voice_input when NEXT_PUBLIC_FEATURE_VOICE_INPUT=false is set", () => {
    vi.stubEnv("NEXT_PUBLIC_FEATURE_VOICE_INPUT", "false");

    expect(isFeatureEnabled("voice_input")).toBe(false);
  });

  it("keeps voice_input enabled when NEXT_PUBLIC_FEATURE_VOICE_INPUT=true is set explicitly", () => {
    vi.stubEnv("NEXT_PUBLIC_FEATURE_VOICE_INPUT", "true");

    expect(isFeatureEnabled("voice_input")).toBe(true);
  });
});
