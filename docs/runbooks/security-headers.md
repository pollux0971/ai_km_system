# Security headers (E01-S029)

Six HTTP security headers on `apps/web` and `apps/admin`, plus two
equivalent headers on `apps/api`. Root cause fix for both Next apps
previously shipping zero security headers.

## Header set (web + admin, identical values)

| Header | Value | Sent when | Set by |
|---|---|---|---|
| `Content-Security-Policy` | see below | always | `src/middleware.ts` (needs a per-request nonce) |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | only when the request carries `x-forwarded-proto: https` | `next.config.ts` `headers()` |
| `X-Content-Type-Options` | `nosniff` | always | `next.config.ts` `headers()` |
| `X-Frame-Options` | `DENY` | always | `next.config.ts` `headers()` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | always | `next.config.ts` `headers()` |
| `Permissions-Policy` | `microphone=(self), camera=(), geolocation=()` | always | `next.config.ts` `headers()` |

### CSP directives

```
default-src 'self'; connect-src 'self'; img-src 'self' data:;
style-src 'self' 'unsafe-inline';
script-src 'self' 'nonce-<random>' 'strict-dynamic'[ 'unsafe-eval' in dev];
font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

Every widening from the `default-src 'self'` baseline is deliberate and
individually justified — see `src/middleware.ts`'s doc comment in each app
for the full reasoning. In short:

- `style-src 'unsafe-inline'` — Next.js injects inline `<style>` at runtime.
- `script-src` uses a **fresh per-request nonce + `'strict-dynamic'`**, not
  `'unsafe-inline'` — see "Why a nonce, not `'unsafe-inline'`" below. `'self'`
  stays in the list as a fallback for browsers that don't support
  `'strict-dynamic'` (CSP3); a `'strict-dynamic'`-aware browser ignores it and
  trusts only the nonced script plus whatever it dynamically loads.
- `script-src 'unsafe-eval'` — **development only**
  (`process.env.NODE_ENV !== "production"`). React Fast Refresh / webpack HMR
  under `next dev` needs `eval`. Production (`next build && next start`, and
  every real deployment per ADR 0003) never gets it.
- `font-src 'self'` is **not** widened to `fonts.googleapis.com` /
  `fonts.gstatic.com` — E01-S022 self-hosts fonts as local woff2 files
  specifically to avoid that dependency; this CSP must not reintroduce it.

### Why a nonce, not `'unsafe-inline'` (the investigation)

The original plan was `script-src 'self'` with no relaxation beyond dev-only
`'unsafe-eval'`. That broke almost the entire existing E2E suite —
`getByLabel("帳號")` on `/login` timed out on ~250 of 264 tests. Root-caused
with first-hand evidence, not guesswork:

```bash
$ curl -sI http://localhost:3000/login | grep -i content-security-policy
Content-Security-Policy: ...; script-src 'self' 'unsafe-eval'; ...

$ curl -s http://localhost:3000/login | grep -o '<script[^>]*>'
<script>                                                    ← the only one with no src
<script src="/_next/static/chunks/app/error.js" async="">
...(every other <script> tag has a src)
```

The inline script's content is `(self.__next_f=self.__next_f||[]).push(...)`
— Next.js App Router's own **RSC (React Server Components) streaming
flight-data bootstrap**, present in both dev and production (it is how
App Router delivers server-rendered payload to the client for hydration,
not a Fast-Refresh artifact). `'unsafe-eval'` only covers `eval()`/
`Function()` and cannot fix this — a `<script>` tag with no `src` needs
either `'unsafe-inline'` or a nonce. CSP blocking it meant React never
hydrated `/login`, so its form (a client component) never appeared in the
DOM — which is also why `curl` looked fine (200, full HTML) while every
real-browser test failed: `curl` never executes JS.

A CSP-violation survey (CSP switched to `Content-Security-Policy-Report-Only`
temporarily, walked `/login` → home → `/conversations/new` → `/knowledge` →
`/profile`) collected 38 distinct violations. **All 38 were this exact
mechanism** — different sha256 hashes only because each RSC chunk's content
differs, but semantically one root cause. Zero violations of any other kind
(no eval, no style, no connect-src/img-src/font-src). That single, precisely
localized root cause is what made choosing nonce-based CSP (over weakening
`script-src` with `'unsafe-inline'`, which would have defeated CSP's main
defense against injected-script XSS) an easy call once diagnosed.

### The nonce implementation — two parts, both required

**1. `src/middleware.ts` generates a nonce and sets the CSP header** (Next's
documented pattern: https://nextjs.org/docs/app/guides/content-security-policy).
Also forwards it as the `x-nonce` request header — the mechanism Next's own
App Router runtime reads to nonce its own inline scripts:

```ts
const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
const csp = buildCsp(nonce); // script-src 'self' 'nonce-${nonce}' 'strict-dynamic'[ 'unsafe-eval']
requestHeaders.set("x-nonce", nonce);
requestHeaders.set("Content-Security-Policy", csp);
// ...and the same on the outgoing response headers.
```

**2. The root `layout.tsx` in each app must call `headers()`** (even if the
return value is unused) — `await headers();` in `RootLayout`. This is *not*
optional bookkeeping: without it, the route stays statically optimized and
Next.js does **not** thread the nonce into its own inline scripts at all —
confirmed empirically (see "Empirical verification" below), the RSC payload
served a literal `"nonce":"$undefined"` and the inline `<script>` tags had no
`nonce` attribute whatsoever, which strict `script-src` would still have
blocked. Calling `headers()` (a Next.js "dynamic API") is what opts the route
into per-request dynamic rendering AND is the signal Next's runtime uses to
actually apply the nonce to scripts it generates for that render.

### Empirical verification (`next build && next start`)

```bash
$ curl -sD - http://localhost:3999/login -o body1.html
Content-Security-Policy: ...; script-src 'self' 'nonce-N2E2Yj...' 'strict-dynamic'; ...
$ grep -o '<script[^>]*>' body1.html
<script nonce="N2E2Yj...">                                          (×4, inline)
<script src="/_next/static/chunks/webpack-....js" nonce="N2E2Yj..." ...>
...(every script tag — inline AND external chunks — carries the SAME nonce as the header)

$ curl -sD - http://localhost:3999/login -o body2.html   # second request
Content-Security-Policy: ...; script-src 'self' 'nonce-ODI4ZW...' 'strict-dynamic'; ...
                                                    ↑ different nonce, correctly fresh per request
```

Also verified with a real Playwright browser against the fully enforced
(non-Report-Only) CSP under `next dev` — `getByLabel("帳號")` on `/login` now
resolves, proving hydration actually succeeds
(`tests/e2e/specs/security-headers.spec.ts`'s
`"a real browser page load hydrates under the enforced ... CSP"` test).

### The real cost: static optimization is gone

Calling `headers()` in the root layout forces **every route** into dynamic
(server-rendered-per-request) mode. Before this story:

```
├ ○ /login          19.1 kB   122 kB      (○ = static, prerendered at build time)
├ ○ /conversations/new
├ ○ /knowledge
...
```

After:

```
├ ƒ /login          19.1 kB   122 kB      (ƒ = dynamic, rendered on every request)
├ ƒ /conversations/new
├ ƒ /knowledge
...
```

Confirmed on both apps — `apps/admin`'s entire route table (21/21 routes)
is now dynamic too (it had no static routes to lose relative to the
baseline, but the same mechanism applies). This is an inherent, documented
Next.js tradeoff of per-request-nonce CSP, not a bug: a nonce is by
definition different every request, so a page containing it cannot be a
single cached static artifact. Consequences: no CDN/browser caching of the
HTML shell for these routes, and every request now pays a render cost that
static pages didn't. The user accepted this tradeoff when authorizing the
nonce approach (2026-08-29) — flagged explicitly per `ai-km-e4`'s request,
since the original "story gets ~half a day bigger" framing hadn't mentioned
the performance side of the decision.

### HSTS conditional mechanism (unchanged, still in `next.config.ts`)

```ts
{
  source: "/(.*)",
  has: [{ type: "header", key: "x-forwarded-proto", value: "https" }],
  headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }],
}
```

Every real deployment terminates TLS at a reverse proxy that sets
`x-forwarded-proto` (ADR 0003 §6); there is no direct-TLS-without-proxy path
in this architecture, so this one signal is sufficient.

## `apps/api` (`@fastify/helmet`)

Only two headers, registered in `apps/api/src/server.ts`:
`X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`. Every other
helmet default (CSP, HSTS, cross-origin-*, referrer-policy, etc.) is
explicitly disabled — a JSON API response is never rendered as a page, so a
browser CSP is meaningless for it, and HSTS unconditionally sent from the API
would defeat the whole point of gating it on `x-forwarded-proto` at the
Next.js layer (the API has no such gate).

## Verifying by hand

```bash
# Dev headers (apps/web)
curl -sD - http://localhost:3000/login -o /dev/null

# HSTS only appears with the forwarded-proto signal
curl -sD - -H "x-forwarded-proto: https" http://localhost:3000/login -o /dev/null

# apps/api
curl -sD - http://localhost:4000/v1/health -o /dev/null

# Production build check (static→dynamic + nonce threading)
cd apps/web && pnpm build   # look for the ƒ/○ route table
PORT=3999 pnpm start &
curl -sD - http://localhost:3999/login -o /dev/null   # compare header nonce to body script nonce= attrs
```

## E2E: this repo's shared-machine E2E lock

`tests/e2e/playwright.config.ts` binds fixed ports (`:3000`/`:3001`) with
`reuseExistingServer: true`. Running Playwright without holding
`/data/python/AI_KM-worktrees/.e2e.lock` risks testing another worktree's dev
server instead of your own — see `archive/ROADMAP_TEMP.md` §5 for the mandatory
`flock` wrapping rule (unrelated to this story's own header logic, but this
story's E2E evidence was gathered under it).
