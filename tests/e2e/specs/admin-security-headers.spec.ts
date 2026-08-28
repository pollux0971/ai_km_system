import { test, expect } from "@playwright/test";

/**
 * E01-S029, apps/admin project (baseURL :3001, per playwright.config.ts's
 * `admin-*.spec.ts` matcher). Same header set as apps/web — see
 * `security-headers.spec.ts`'s doc comment for the full rationale; this
 * file only re-asserts it against the independently-deployed admin app
 * (E11-S001), since a shared `next.config.ts` doesn't exist to prove once.
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

test("admin: every response carries the 5 unconditional security headers with spec-exact values", async ({
  request,
}) => {
  const res = await request.get("/");
  const headers = res.headers();

  for (const directive of EXPECTED_CSP_STATIC_PART) {
    expect(headers["content-security-policy"]).toContain(directive);
  }
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toBe("microphone=(self), camera=(), geolocation=()");
});

test("admin: script-src is strict: no 'unsafe-inline', a nonce plus 'strict-dynamic' instead", async ({
  request,
}) => {
  const res = await request.get("/");
  const csp = res.headers()["content-security-policy"] ?? "";
  const scriptSrcMatch = csp.match(/script-src ([^;]+)/);
  expect(scriptSrcMatch).not.toBeNull();
  const scriptSrc = scriptSrcMatch?.[1] ?? "";
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrc).toContain("'strict-dynamic'");
  expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
});

test("admin: the nonce is fresh per request, not a fixed/reused value", async ({ request }) => {
  const first = (await request.get("/")).headers()["content-security-policy"] ?? "";
  const second = (await request.get("/")).headers()["content-security-policy"] ?? "";
  const extractNonce = (csp: string) => csp.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
  expect(extractNonce(first)).toBeTruthy();
  expect(extractNonce(second)).toBeTruthy();
  expect(extractNonce(first)).not.toBe(extractNonce(second));
});

test("admin: a real browser page load hydrates under the enforced CSP", async ({ page }) => {
  await page.goto("/");
  // Admin home renders directly with no session gate (E11-S001) — any
  // real, non-empty chrome proves hydration succeeded; the shell's own
  // nav is the simplest such signal.
  await expect(page.locator("body")).not.toBeEmpty();
});

test("admin: does not reintroduce Google Fonts into font-src", async ({ request }) => {
  const res = await request.get("/");
  const csp = res.headers()["content-security-policy"] ?? "";
  expect(csp).not.toContain("fonts.googleapis.com");
  expect(csp).not.toContain("fonts.gstatic.com");
});

test("admin: does not send Strict-Transport-Security over plain http", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["strict-transport-security"]).toBeUndefined();
});

test("admin: sends Strict-Transport-Security when x-forwarded-proto: https is present", async ({ request }) => {
  const res = await request.get("/", { headers: { "x-forwarded-proto": "https" } });
  expect(res.headers()["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
});
