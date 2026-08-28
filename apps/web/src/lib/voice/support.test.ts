import { afterEach, describe, expect, it, vi } from "vitest";
import { isVoiceCaptureSupported } from "./support";

function stubSupportedEnvironment(): void {
  vi.stubGlobal("AudioWorkletNode", class {});
  Object.defineProperty(window, "isSecureContext", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn() },
    configurable: true,
  });
}

describe("isVoiceCaptureSupported", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is true when secure context + getUserMedia + AudioWorkletNode are all present", () => {
    stubSupportedEnvironment();
    expect(isVoiceCaptureSupported()).toBe(true);
  });

  it("is false when not a secure context", () => {
    stubSupportedEnvironment();
    Object.defineProperty(window, "isSecureContext", {
      value: false,
      configurable: true,
    });
    expect(isVoiceCaptureSupported()).toBe(false);
  });

  it("is false when mediaDevices.getUserMedia is unavailable", () => {
    stubSupportedEnvironment();
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      configurable: true,
    });
    expect(isVoiceCaptureSupported()).toBe(false);
  });

  it("is false when AudioWorkletNode is unavailable", () => {
    stubSupportedEnvironment();
    vi.unstubAllGlobals();
    Object.defineProperty(window, "isSecureContext", {
      value: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn() },
      configurable: true,
    });
    expect(isVoiceCaptureSupported()).toBe(false);
  });
});
