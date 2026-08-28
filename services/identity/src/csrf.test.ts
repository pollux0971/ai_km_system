import Fastify, { type FastifyRequest } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { CSRF_HEADER, checkCsrf } from "./csrf.js";

let app: ReturnType<typeof Fastify> | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function requestFor(opts: {
  method: string;
  headers?: Record<string, string>;
}): Promise<FastifyRequest> {
  app = Fastify();
  let captured: FastifyRequest | undefined;
  app.route({
    method: opts.method as "GET",
    url: "/x",
    handler: async () => ({ ok: true }),
    onRequest: async (request: FastifyRequest) => {
      captured = request;
    },
  });
  await app.inject({
    method: opts.method as "GET",
    url: "/x",
    headers: opts.headers ?? {},
  });
  if (!captured) throw new Error("request was not captured");
  return captured;
}

describe("checkCsrf — GET/HEAD/OPTIONS are never checked (red line)", () => {
  it.each(["GET", "HEAD", "OPTIONS"])(
    "%s always passes with no header at all",
    async (method) => {
      const request = await requestFor({ method });
      expect(checkCsrf(request, []).allowed).toBe(true);
    },
  );
});

describe("checkCsrf — non-multipart state-changing requests require the header", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s is denied with no x-requested-with header",
    async (method) => {
      const request = await requestFor({ method });
      expect(checkCsrf(request, []).allowed).toBe(false);
    },
  );

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s passes once x-requested-with is present (any non-empty value)",
    async (method) => {
      const request = await requestFor({
        method,
        headers: { [CSRF_HEADER]: "XMLHttpRequest" },
      });
      expect(checkCsrf(request, []).allowed).toBe(true);
    },
  );

  it("passes with any non-empty value, not just the conventional 'XMLHttpRequest' string", async () => {
    const request = await requestFor({
      method: "POST",
      headers: { [CSRF_HEADER]: "anything" },
    });
    expect(checkCsrf(request, []).allowed).toBe(true);
  });

  it("is denied when the header is present but empty", async () => {
    const request = await requestFor({
      method: "POST",
      headers: { [CSRF_HEADER]: "" },
    });
    expect(checkCsrf(request, []).allowed).toBe(false);
  });
});

describe("checkCsrf — multipart/form-data uses Origin/Referer instead (AC4)", () => {
  it("passes with a loopback Origin, even with no allowlist configured", async () => {
    const request = await requestFor({
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        origin: "http://127.0.0.1:3000",
      },
    });
    expect(checkCsrf(request, []).allowed).toBe(true);
  });

  it("passes with localhost Origin too", async () => {
    const request = await requestFor({
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        origin: "http://localhost:4000",
      },
    });
    expect(checkCsrf(request, []).allowed).toBe(true);
  });

  it("passes with an Origin on the configured allowlist", async () => {
    const request = await requestFor({
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        origin: "https://app.example.com",
      },
    });
    expect(checkCsrf(request, ["https://app.example.com"]).allowed).toBe(true);
  });

  it("is denied with an Origin NOT on the allowlist and not loopback", async () => {
    const request = await requestFor({
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        origin: "https://evil.example",
      },
    });
    expect(checkCsrf(request, ["https://app.example.com"]).allowed).toBe(false);
  });

  it("falls back to Referer's origin when Origin is absent", async () => {
    const request = await requestFor({
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        referer: "https://app.example.com/upload?x=1",
      },
    });
    expect(checkCsrf(request, ["https://app.example.com"]).allowed).toBe(true);
  });

  it("is denied when BOTH Origin and Referer are absent (fail closed)", async () => {
    const request = await requestFor({
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
    });
    expect(checkCsrf(request, ["https://app.example.com"]).allowed).toBe(false);
  });

  it("is denied for a malformed Referer that cannot be parsed as a URL", async () => {
    const request = await requestFor({
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        referer: "not-a-url",
      },
    });
    expect(checkCsrf(request, []).allowed).toBe(false);
  });

  it("ignores x-requested-with entirely for multipart — Origin/Referer is the only signal", async () => {
    const request = await requestFor({
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        [CSRF_HEADER]: "XMLHttpRequest",
        origin: "https://evil.example",
      },
    });
    expect(checkCsrf(request, ["https://app.example.com"]).allowed).toBe(false);
  });

  it("GET with multipart content-type is still never checked (method gate wins)", async () => {
    const request = await requestFor({
      method: "GET",
      headers: { "content-type": "multipart/form-data; boundary=x" },
    });
    expect(checkCsrf(request, []).allowed).toBe(true);
  });
});
