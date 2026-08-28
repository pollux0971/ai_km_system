# tests/e2e

Playwright E2E for `apps/web` (:3000) and `apps/admin` (:3001), now running
against a real `apps/api` (:4100) instead of a client-side mock (E03-S038).

## Running locally

```bash
pnpm test:e2e
# or, from this directory:
pnpm test
```

`playwright.config.ts` starts all three servers itself (`webServer`) and
waits for each to report healthy before any test runs. Nothing needs to be
started manually.

## Ports

| Server | Port | Started by | `reuseExistingServer` |
|---|---|---|---|
| `apps/web` | 3000 | Playwright `webServer` | `true` (pre-existing behaviour; E01-S030 will make this CI-conditional) |
| `apps/admin` | 3001 | Playwright `webServer` | `true` (same) |
| `apps/api` | **4100** — deliberately NOT 4000 | Playwright `webServer` | **`false`** |

`apps/api` runs on 4100, not the "default" 4000, and always starts its own
fresh instance (`reuseExistingServer: false`). This is deliberate, not an
oversight: a shared, manually-run `apps/api` on :4000 is common during
development (other lanes' own manual verification) — if this webServer
entry also targeted :4000 with `reuseExistingServer: true`, Playwright would
silently reuse that shared instance instead of starting its own, quietly
defeating every isolation property this story exists to provide (own tmp
SQLite, own test-sandbox/fake-ASR env) — this actually happened once during
this story's own development, see `docs/stories/E03-S038.md`'s EVIDENCE. A
brand-new webServer entry doesn't need to wait on E01-S030's CI-conditional
fix to get this right: if port 4100 is ever unexpectedly occupied, this
config fails loudly instead of silently adopting whatever is there.

## `apps/api`'s E2E environment

Set via `playwright.config.ts`'s `webServer[2].env` (all already-existing
`apps/api` config flags — see `apps/api/src/config.ts` — no new env var was
invented for this story):

| Var | Value | Why |
|---|---|---|
| `AI_KM_DB_PATH` | `<os.tmpdir()>/ai-km-e2e-<run-id>.sqlite` | A throwaway SQLite file per Playwright invocation — never checked into git, never shared across runs. |
| `AI_KM_TEST_SANDBOX` | `true` | Every login gets its own fresh, isolated owner (`services/identity`'s `runSandboxSeeders`) — see `specs/api-sandbox.spec.ts` for the test proving this. |
| `AI_KM_DEV_TRIGGERS` | `true` | Enables dev/test-only trigger paths some specs rely on. |
| `AI_KM_SEED_DEMO_USERS` | `true` | Seeds the demo accounts (`demo-user`, `demo-maintenance`, ... — `services/identity/src/repository.ts`) so `loginAs()`/existing specs' inline `login()` can authenticate against the real backend. |
| `AI_KM_ASR_PROVIDER` | `fake` | No real whisper-server sidecar dependency for E2E (see `services/model-gateway`'s fake provider). |
| `AI_KM_LOG_LEVEL` | `warn` | Keeps `apps/api`'s own stdout from drowning out Playwright's output during a full run. |

## Sandbox semantics

With `AI_KM_TEST_SANDBOX=true`, every successful login is assigned a fresh,
isolated "owner" — two different browser contexts logging in as the exact
same demo account (e.g. both as `demo-user`) get two independent sandboxes
that cannot see each other's conversations/messages. A second **page**
within the **same** browser context (same session cookie, no second login)
shares the same sandbox as the first page. This replaces the old model,
where isolation came from each browser tab's own `sessionStorage`-backed
client-side mock — see `specs/api-sandbox.spec.ts` for the test proving both
halves of this claim.

Per-owner starting data (seeded sample conversations/messages) is
**not yet wired in** as of this story — that is E04-S052 (owned by another
lane), tracked separately. Specs that depend on seeded conversations being
present are the ones listed as deferred in this story's own EVIDENCE
(`docs/stories/E03-S038.md`).

## Fake microphone

`playwright.config.ts`'s `web` project passes Chromium
`--use-fake-ui-for-media-stream` + `--use-fake-device-for-media-stream` +
`--use-file-for-fake-audio-capture=<generated wav>%noloop`, and grants the
`microphone` permission up front. The WAV itself (1.5s 440Hz tone + 0.5s
silence) is generated fresh into `os.tmpdir()` on every run by
`helpers/fake-microphone.ts` — never checked into git — and is generated
synchronously at `playwright.config.ts`'s module top level (not via
Playwright's `globalSetup` hook, which runs too late to reach
`launchOptions.args` — see that helper's own doc comment for why). Any spec
can call `navigator.mediaDevices.getUserMedia({audio:true})` and get a real,
live audio track without a browser permission prompt ever appearing — see
`specs/api-sandbox.spec.ts`'s dedicated test.

## Flaky tests / resource contention

Running this suite alongside other heavy local processes (other worktrees'
own dev servers, builds, etc.) can produce `page.goto`/`page.waitForURL`
timeouts unrelated to any code change — see `docs/stories/E03-S038.md`'s
EVIDENCE and the project root's `ROADMAP_TEMP.md` §5-ter for the specific
spec names and how to tell a real regression from this known pattern.
E01-S027 is the dedicated follow-up story for the underlying root causes.
