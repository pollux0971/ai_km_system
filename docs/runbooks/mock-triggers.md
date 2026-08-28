# Mock / simulation triggers

Every deterministic demo/test hook in this codebase that lets a user
*intentionally* reach an otherwise-hard-to-trigger state (a fake answer
state, a simulated stream disconnect, a simulated processing failure, a
deterministic server error) by typing a specific string or using a
specific account. New file — created by E03-S045; extend as later
stories add more.

**Production posture**: every trigger below is gated off by default.
E03-S045 added the client-side gate (`mock_triggers` feature flag); the
one server-side trigger (`service-error`) already had its own gate from
an earlier story. A production user must never be able to fake a
`PERMISSION_DENIED`/`SOURCE_UNAVAILABLE` answer, a stream disconnect, or
a processing failure just by typing a bracketed string.

## `[模擬:X]` client-side triggers (gated by the `mock_triggers` flag)

| Trigger string | Where | Effect | Constant |
|---|---|---|---|
| `[模擬:PARTIAL]` | `apps/web/src/lib/answer-state.ts` | Answer state → `PARTIAL` | `MOCK_ANSWER_STATE_TRIGGERS.PARTIAL` |
| `[模擬:NO_EVIDENCE]` | `apps/web/src/lib/answer-state.ts` | Answer state → `NO_EVIDENCE` | `MOCK_ANSWER_STATE_TRIGGERS.NO_EVIDENCE` |
| `[模擬:ERROR]` | `apps/web/src/lib/answer-state.ts` | Answer state → `ERROR` | `MOCK_ANSWER_STATE_TRIGGERS.ERROR` |
| `[模擬:PERMISSION_DENIED]` | `apps/web/src/lib/answer-state.ts` | Answer state → `PERMISSION_DENIED` | `MOCK_ANSWER_STATE_TRIGGERS.PERMISSION_DENIED` |
| `[模擬:SOURCE_UNAVAILABLE]` | `apps/web/src/lib/answer-state.ts` | Answer state → `SOURCE_UNAVAILABLE` | `MOCK_ANSWER_STATE_TRIGGERS.SOURCE_UNAVAILABLE` |
| `[模擬:STREAM_DISCONNECT]` | `apps/web/src/lib/streaming.ts` | Simulated mid-stream disconnect (E03-S031) | `MOCK_STREAM_DISCONNECT_TRIGGER` |
| `[模擬:PROCESSING_FAILED]` | `apps/web/src/lib/file-processing.ts` | Attached-file processing → `failed` (composer / message-thread flow) | `MOCK_FILE_PROCESSING_FAILURE_TRIGGER` |
| `[模擬:KB_PROCESSING_FAILED]` | `apps/web/src/lib/knowledge-documents.ts` | Knowledge-base document processing → `failed` | `MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER` |

**Gate**: `apps/web/src/lib/feature-flags.ts`'s `"mock_triggers"` flag
(`isFeatureEnabled("mock_triggers")`), `defaultEnabled: false`, override
via `NEXT_PUBLIC_FEATURE_MOCK_TRIGGERS`. Every function above checks the
flag first and short-circuits to its non-simulated default (`ANSWERED`
for answer state, `false` for stream disconnect, `"done"` for file
processing, no `status: "failed"` for KB documents) when the flag is
off — the trigger strings and their matching logic themselves are
unchanged, only reachability is gated.

`docs/runbooks/config.md`'s own entry format doesn't cover feature
flags (only plain config values), so this trigger stays documented here
rather than there.

## Server-side trigger (separate gate, not part of this story's code changes)

| Trigger | Where | Effect | Gate |
|---|---|---|---|
| Username `service-error` | `services/identity/src/plugin.ts` | Deterministic login failure | `AI_KM_DEV_TRIGGERS` env (server-side; E02-S032) |

This one already had its own independent gate before E03-S045 — E03-S045
only confirms it stays enabled for E2E (`tests/e2e/playwright.config.ts`'s
`apps/api` webServer already sets `AI_KM_DEV_TRIGGERS: "true"`, from
E03-S038) and lists it here for a complete inventory. `services/*` is
outside E03-S045's allowed-modify list, so no code change was made here.

## Where each is turned back on for testing

| Environment | File | Setting |
|---|---|---|
| Unit tests (`apps/web`) | `apps/web/vitest.setup.ts` | `process.env.NEXT_PUBLIC_FEATURE_MOCK_TRIGGERS = "true"` |
| E2E (`tests/e2e`) | `tests/e2e/playwright.config.ts` (`web` webServer `env`) | `NEXT_PUBLIC_FEATURE_MOCK_TRIGGERS: "true"` |
| E2E, server-side trigger | `tests/e2e/playwright.config.ts` (`apps/api` webServer `env`) | `AI_KM_DEV_TRIGGERS: "true"` (already set since E03-S038) |
