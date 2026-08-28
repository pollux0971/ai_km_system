# apps/api

The single HTTP surface for the AI KM backend: **Fastify 5, Node 22,
TypeScript strict, ESM**, listening on `127.0.0.1:4000` with every route under
`/v1`. Created by **E04-S039**; the decisions behind it are fixed in
[ADR 0003](../../docs/adr/0003-api-runtime-sqlite-sse.md).

> **This app owns no domain logic.** It owns bootstrap only: configuration,
> logging, correlation ids, the error envelope, the contract registry and the
> authentication seam. Domain code lives in `services/<domain>` and is mounted
> here as a Fastify plugin — see [Adding a domain plugin](#adding-a-domain-plugin).

## Running it

```bash
pnpm --filter @ai-km/api dev        # tsx watch, reloads on change
pnpm --filter @ai-km/api build      # tsc -> dist/
pnpm --filter @ai-km/api start      # node dist/main.js
pnpm --filter @ai-km/api typecheck
pnpm --filter @ai-km/api lint
pnpm --filter @ai-km/api test       # vitest
pnpm --filter @ai-km/api migrate    # placeholder — E04-S040 implements it
```

Smoke check:

```bash
curl -i http://127.0.0.1:4000/v1/health
# HTTP/1.1 200 OK
# x-correlation-id: 6ee1...-...
# {"status":"ok","version":"0.1.0","uptimeMs":1234}
```

`/v1/health` is an **operations** endpoint: it needs no session, is not part of
any contract in `contracts/openapi/`, and deliberately returns only
`{status, version, uptimeMs}` — no paths, no environment, no dependency
details. `status` is `"ok"` unless a subsystem (`api`/`database`/`migrations`/
`asr`, checked and cached for 5s — see `src/health/checks.ts`) is `down`, in
which case it is `"degraded"` — but the HTTP status stays `2xx` either way,
because every lane's own E2E setup polls this with `curl -sf` (which fails on
any non-2xx), and a temporarily-unreachable ASR sidecar must not read as "the
whole API is down" to that check.

For the full per-subsystem breakdown (`contracts/openapi/analytics.yaml`'s
`SystemHealth`), see `GET /v1/admin/health` below (E04-S047 AC2) — gated by
`requireAnyRole` to `it_administrator`/`ai_administrator`/`auditor`/
`super_administrator`, since the detail `/v1/health` deliberately omits would
leak internal topology to an unauthenticated caller:

```bash
curl -i http://127.0.0.1:4000/v1/admin/health -H "Cookie: ai_km_session=<real session>"
# HTTP/1.1 200 OK
# {"checkedAt":"2026-08-28T12:00:00.000Z","subsystems":[
#   {"name":"api","status":"ok"},
#   {"name":"database","status":"ok"},
#   {"name":"migrations","status":"ok"},
#   {"name":"asr","status":"down","detail":"fetch failed"}
# ]}
```

## Configuration

Every variable is read once at startup and validated. An invalid value exits
the process; it never falls back to a default, because a server that quietly
ran with the wrong port or the wrong ASR provider is harder to diagnose than
one that refused to start. Full list with comments: [`.env.example`](.env.example).

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | Unset is treated as development, **never** production |
| `AI_KM_API_HOST` | `127.0.0.1` | Loopback by default |
| `AI_KM_API_PORT` | `4000` | 1–65535 |
| `AI_KM_DB_PATH` | `./data/ai-km.sqlite` | E04-S040 owns the schema |
| `AI_KM_CORS_ORIGINS` | *(empty)* | Empty ⇒ CORS plugin is not registered at all |
| `AI_KM_DEV_TRIGGERS` | `false` | **Refuses to start** if true in production |
| `AI_KM_TEST_SANDBOX` | `false` | **Refuses to start** if true in production |
| `AI_KM_ASR_PROVIDER` | `whisper-server` | or `fake` (tests only) |
| `AI_KM_ASR_SERVER_URL` | `http://127.0.0.1:8178` | must parse as a URL |
| `AI_KM_LOG_LEVEL` | `info` | pino levels, plus `silent` |

Booleans accept only the exact strings `true` / `false`. `AI_KM_TEST_SANDBOX=yes`
is a startup error, not a quiet `false` — a security flag that silently reads
"off" is as bad as one that silently reads "on".

## Adding a domain plugin

A domain exports a Fastify plugin from `services/<domain>` and is registered in
[`src/server.ts`](src/server.ts) with a single line. Everything below is
already done for you by the time your plugin runs.

```ts
// services/conversation/src/plugin.ts
import type { FastifyPluginAsync } from "fastify";
import { ApiHttpError, ERROR_CODES } from "@ai-km/api/errors";

export const conversationPlugin: FastifyPluginAsync = async (app) => {
  app.get(
    "/v1/conversations/:id",
    {
      preHandler: app.requireSession,                       // 1. authorize first
      schema: { body: app.contracts.getSchema("conversations", "UpdateConversationRequest") },
    },
    async (request) => {
      const ownerKey = request.auth!.ownerKey;              // 2. scope by ownerKey
      const row = await findConversation(request.params.id, ownerKey);
      if (!row) throw new ApiHttpError(ERROR_CODES.NOT_FOUND, 404, "找不到這筆對話。");
      return row;
    },
  );
};
```

Then in `src/server.ts`, after `registerAuth(...)`:

```ts
await app.register(conversationPlugin);
```

### The five rules a plugin must follow

1. **`preHandler: app.requireSession` on every protected route.** The default
   implementation denies everything with 401. It is replaced by the real
   session lookup in **E02-S032**; until then a protected route correctly
   returns 401 rather than falling open.
2. **Filter data by `request.auth.ownerKey`, never by `userId`.** Under
   `AI_KM_TEST_SANDBOX` the owner key carries a per-login sandbox suffix
   (ADR 0005 §5); querying by `userId` would leak across sandboxes.
3. **Bind request schemas from the contract**, via
   `app.contracts.getSchema(spec, schemaName)` — do not hand-copy a schema.
   A route that drifts from `contracts/openapi/*.yaml` must go red, and it
   cannot if the route carries its own copy.
4. **Throw `ApiHttpError`** for every deliberate failure. Anything else that
   escapes is treated as a bug and becomes a 500 with no detail.
5. **Never log a body, cookie or authorization header.** The logger redacts
   the known ones, but a plugin that logs `request.body` itself defeats that.

### Available decorators

| Decorator | Type | Provided by |
|---|---|---|
| `app.requireSession` | `preHandler` | this app (denies by default), replaced by E02-S032 |
| `app.contracts` | `ContractRegistry` | this app |
| `request.auth` | `AuthContext \| undefined` | set by `requireSession` on success |
| `request.correlationId` | `string` | this app |

## Errors

Every failure leaves this server as `core.yaml`'s `Error` envelope —
`{code, message, details?}` — with a stable machine-readable `code` from
[ADR 0003 §4](../../docs/adr/0003-api-runtime-sqlite-sse.md). Consumers switch
on `code`; they must never parse `message`.

`VALIDATION_ERROR` adds `details.issues[]`, each `{path, message}`. **The
rejected value is never echoed back** — a 400 body is the response most likely
to be logged or pasted into a ticket, and reflecting input is how a mistyped
secret ends up somewhere it should not be.

Unexpected exceptions become a 500 `INTERNAL_ERROR` whose body contains no
stack, no file path and no original message. The stack is logged server-side.

### Request validation is strict

Fastify's stock Ajv runs with `removeAdditional: true`, which silently *drops*
any property the schema does not declare. That is wrong for a contract-first
API twice over: the client is told it succeeded while part of its request was
discarded, and a misspelled field name becomes invisible instead of a 400. So:

- **bodies** are validated with `removeAdditional: false` and **no** type
  coercion — the contract says `integer`, so `"3"` is a client bug;
- **query strings, params and headers** keep coercion, because those are
  always strings on the wire.

## Correlation ids

`x-correlation-id` is read from the request (apps/web's middleware already
sends one), or generated as a uuid v4 when absent or malformed. It becomes
Fastify's own request id, so it appears on the framework's automatic request
log lines as well as anything a handler logs, and it is echoed back on the
response header.

An inbound id that does not match `^[A-Za-z0-9._:-]{1,128}$` is **replaced,
not echoed** — it lands in every log line for that request, and unbounded
attacker-controlled text in a log is a log-injection vector.

## Contracts

`contracts/openapi/*.yaml` is loaded and fully dereferenced at startup
(including cross-file `$ref` into `core.yaml`), then exposed as
`app.contracts`:

```ts
app.contracts.specNames();                                  // ["conversations", "core", ...]
app.contracts.getSchema("conversations", "Conversation");   // for schema binding
app.contracts.validateResponse(spec, path, method, status, body);
```

Contracts are an **input**, never an output: nothing here generates OpenAPI
from code.

### Contract tests

```ts
import { getContractRegistry } from "@ai-km/api/testing/contract";
import { expectResponseMatchesContract } from "@ai-km/api/testing/contract";

const registry = await getContractRegistry();
const res = await app.inject({ method: "GET", url: "/v1/conversations" });
expectResponseMatchesContract("conversations", "/conversations", "get", 200, res.json(), registry);
```

It throws (never returns a boolean) naming the spec, path, method, status and
the offending field. A check that can be defeated by forgetting an `expect()`
is not a gate.

## Security posture

- Binds loopback; CORS is not registered at all unless an allowlist is set.
- `AI_KM_DEV_TRIGGERS` and `AI_KM_TEST_SANDBOX` **cannot** be enabled in
  production — `loadConfig` refuses, and `buildServer` refuses again at the
  point the bypass would be wired up.
- The `x-test-user` injection header exists only while the test auth provider
  is registered, which production rejects outright.
- The `__test__` routes require both a non-production `NODE_ENV` **and** the
  `src/testing/fixtures` spec to be loaded — a fixture only a test ever passes
  in — so they cannot appear even on a dev server.
- Cookies, `authorization` headers and request bodies are never logged.

## Layout

```
src/
  config.ts             env -> validated, frozen ApiConfig
  contracts.ts          loads + dereferences contracts/openapi/*.yaml
  correlation.ts        x-correlation-id in/out
  errors.ts             ApiHttpError, the Error envelope, the error handler
  auth-decorator.ts     requireSession seam (denies by default)
  server.ts             buildServer() — assembles everything, does not listen
  main.ts               the only place that binds a port
  testing/contract.ts   expectResponseMatchesContract()
  testing/fixtures/     test-only spec for the loader and harness
```

`buildServer()` returns a ready, non-listening instance so tests drive the real
server through `inject()` instead of a mock of it.

## Not here yet

| Missing | Owner |
|---|---|
| SQLite, migrations, `fastify.db` | E04-S040 |
| Real session auth, sandbox owner keys | E02-S032 |
| Conversation / message / feedback routes | E04-S041 – S043 |
| Change-event SSE endpoint | E04-S044 |
| Transcription endpoint | E12-S031 |
| Rate limiting, HTTPS termination | reverse proxy (E01-S028) |
