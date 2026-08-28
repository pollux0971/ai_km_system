import { afterEach, describe, expect, it, vi } from "vitest";

const mockClientSentinel = { kind: "mock" };
const httpClientSentinel = { kind: "http" };
const createMockAuthClient = vi.fn(() => mockClientSentinel);
const createHttpAuthClient = vi.fn(() => httpClientSentinel);

vi.mock("@ai-km/auth-client", () => ({
  createMockAuthClient,
  createHttpAuthClient,
}));
vi.mock("./api", () => ({ apiClient: { kind: "fake-api-client" } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  createMockAuthClient.mockClear();
  createHttpAuthClient.mockClear();
});

describe("authClient backend selection (E03-S035 AC4)", () => {
  it("defaults to the http client when NEXT_PUBLIC_AUTH_BACKEND is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_BACKEND", undefined);

    const { authClient } = await import("./auth");

    expect(authClient).toBe(httpClientSentinel);
    expect(createMockAuthClient).not.toHaveBeenCalled();
  });

  it("uses the mock client when NEXT_PUBLIC_AUTH_BACKEND=mock", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_BACKEND", "mock");

    const { authClient } = await import("./auth");

    expect(authClient).toBe(mockClientSentinel);
    expect(createHttpAuthClient).not.toHaveBeenCalled();
  });

  it("uses the http client for any other value (only the literal 'mock' opts into the mock)", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_BACKEND", "api");

    const { authClient } = await import("./auth");

    expect(authClient).toBe(httpClientSentinel);
  });
});
