import { test, expect } from "@playwright/test";

/**
 * E01-S029. `/login` is used as the probe page throughout — it needs no
 * session, and the header set (5 static ones from `next.config.ts`'s
 * `headers()`, CSP from `middleware.ts`) applies to every route uniformly,
 * so an unauthenticated page proves it without any login flow in the way.
 *
 * `page.request.get()` (not `page.goto()`) is used so the raw response
 * headers are directly inspectable via `APIResponse.headers()`.
 */

const EXPECTED_CSP_STATIC_PART = [
  "default-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

test("every response carries the 5 unconditional security headers with spec-exact values", async ({ request }) => {
  const res = await request.get("/login");
  const headers = res.headers();

  for (const directive of EXPECTED_CSP_STATIC_PART) {
    expect(headers["content-security-policy"]).toContain(directive);
  }
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toBe("microphone=(self), camera=(), geolocation=()");
});

/**
 * Security AC: `script-src` stays strict — no `'unsafe-inline'` — by using a
 * fresh per-request nonce + `'strict-dynamic'` instead (Next.js's own CSP
 * guide pattern; see `apps/web/src/middleware.ts`'s doc comment for why this
 * was required — App Router's own inline RSC bootstrap script needs it,
 * confirmed by this story's own CSP-violation survey). Asserting a
 * *pattern*, not a fixed nonce value, since it's random per request by
 * design; the freshness itself is asserted by the next test.
 */
test("script-src is strict: no 'unsafe-inline', a nonce plus 'strict-dynamic' instead", async ({ request }) => {
  const res = await request.get("/login");
  const csp = res.headers()["content-security-policy"] ?? "";
  const scriptSrcMatch = csp.match(/script-src ([^;]+)/);
  expect(scriptSrcMatch).not.toBeNull();
  const scriptSrc = scriptSrcMatch?.[1] ?? "";
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrc).toContain("'strict-dynamic'");
  expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
});

test("the nonce is fresh per request, not a fixed/reused value", async ({ request }) => {
  const first = (await request.get("/login")).headers()["content-security-policy"] ?? "";
  const second = (await request.get("/login")).headers()["content-security-policy"] ?? "";
  const extractNonce = (csp: string) => csp.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
  const firstNonce = extractNonce(first);
  const secondNonce = extractNonce(second);
  expect(firstNonce).toBeTruthy();
  expect(secondNonce).toBeTruthy();
  expect(firstNonce).not.toBe(secondNonce);
});

test("does not reintroduce Google Fonts into font-src — E01-S022 self-hosts fonts specifically to avoid this", async ({
  request,
}) => {
  const res = await request.get("/login");
  const csp = res.headers()["content-security-policy"] ?? "";
  expect(csp).not.toContain("fonts.googleapis.com");
  expect(csp).not.toContain("fonts.gstatic.com");
});

test("AC2: does not send Strict-Transport-Security over plain http", async ({ request }) => {
  const res = await request.get("/login");
  expect(res.headers()["strict-transport-security"]).toBeUndefined();
});

test("AC2/spec: sends Strict-Transport-Security when the request looks TLS-terminated (x-forwarded-proto: https)", async ({
  request,
}) => {
  const res = await request.get("/login", { headers: { "x-forwarded-proto": "https" } });
  expect(res.headers()["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
});

test("headers apply to every route, not only /login — checked on the (session-gated) home route too", async ({
  request,
}) => {
  const res = await request.get("/");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
});

/**
 * The whole point of the nonce approach: a real browser page load must
 * actually hydrate — this is the regression test for the exact failure mode
 * this story's own investigation found (`'unsafe-eval'` alone left the
 * App Router's inline RSC bootstrap script blocked, so `getByLabel` on
 * /login timed out). If this test is ever red again, CSP is blocking
 * hydration again.
 */
test("a real browser page load hydrates under the enforced (non-Report-Only) CSP — the login form actually appears", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByLabel("帳號")).toBeVisible({ timeout: 10000 });
  await expect(page.getByLabel("密碼")).toBeVisible();
});
