import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * E03-S035 AC6. The actual proxying behavior (does Next.js honor this config against a
 * real upstream) was verified live: `apps/web` dev server on a throwaway port with
 * `API_INTERNAL_URL` pointed at a throwaway fake `/v1/health` server, `curl
 * /api/v1/health` through it — see archive/stories/E03-S035.md. This test guards the
 * *configuration* itself against regressing (wrong path, dropped `API_INTERNAL_URL`
 * override, wrong default) without needing a live server on every test run.
 */
describe("next.config rewrites (E03-S035 AC6)", () => {
  it("proxies /api/v1/:path* to API_INTERNAL_URL/v1/:path* when the env var is set", async () => {
    vi.stubEnv("API_INTERNAL_URL", "https://internal-api.example.test");

    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toEqual([{ source: "/api/v1/:path*", destination: "https://internal-api.example.test/v1/:path*" }]);
  });

  it("defaults to http://127.0.0.1:4000 when API_INTERNAL_URL is unset", async () => {
    vi.stubEnv("API_INTERNAL_URL", undefined);

    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toEqual([{ source: "/api/v1/:path*", destination: "http://127.0.0.1:4000/v1/:path*" }]);
  });
});
