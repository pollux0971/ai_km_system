# @ai-km/tool-asr-readiness

E12-S030. Confirms a machine can build/run whisper.cpp's `whisper-server`
and produce acceptable Traditional-Chinese/English-mixed transcripts
**before** E12-S031's real endpoint code depends on it. Does **not**
implement the ASR endpoint itself (that's `services/model-gateway`,
E12-S031) and does **not** download models/binaries automatically
(spec Non-Goals) — this is a diagnostic + verification tool only.

## Commands

```bash
pnpm --filter @ai-km/tool-asr-readiness check-asr    # is this machine ready? (no network calls)
pnpm --filter @ai-km/tool-asr-readiness verify-asr    # actually call a running whisper-server and score the result
pnpm --filter @ai-km/tool-asr-readiness test          # unit tests (fake sidecar, no real ASR — see below)
```

`AI_KM_ASR_SERVER_BIN` (optional): explicit path to the `whisper-server`
binary, if it's not on `PATH`.

See `../../models/asr/README.md` for how to actually get whisper.cpp
built and the model files downloaded — that's the step-by-step guide;
this README is about the tool, not the environment setup.

## `check-asr`

Read-only, no network calls. Reports (three states — ready / degraded /
not_ready):
- GPU/VRAM (via `nvidia-smi`, gracefully reports "not detected" if
  absent rather than crashing).
- Whether `whisper-server` is found (`AI_KM_ASR_SERVER_BIN` or `PATH`).
- Which model file(s) exist in `../../models/asr/`.
- Which quantization (f16/q5_0) is recommended for the detected VRAM —
  computed from a VRAM threshold, not a hardcoded GPU name (AC1).

Exit code 0 only when `ready`.

## `verify-asr`

Sends `fixtures/sample-zh-en.wav` (real recording, not committed — see
`fixtures/README.md`) to a running `whisper-server` `/inference`,
normalizes the result with OpenCC (`cn→twp`, same conversion
`services/model-gateway` uses in the real endpoint), and checks:
- Keyword hit-rate ≥ 80% (against `fixtures/expected.json`).
- Result is Traditional-Chinese-only (no leftover simplified characters).

Exit code 0 only when both checks pass. Distinct, actionable exit-non-zero
states for: missing fixture, missing `expected.json`, missing model file,
sidecar unreachable, and "responded but quality too low" — see
`src/verify-asr.ts`'s `outcomeToReport`.

## `scripts/asr-server.(sh|ps1)`

Starts the sidecar with the recommended flags (loopback-only,
`-l zh`, the same prompt `services/model-gateway`'s real
`WhisperServerProvider` uses).

## Testing — what's real, what's a fake, and why

`src/*.test.ts` cover this tool's own **logic** (report formatting,
three-state branching, keyword-hit-rate math, the OpenCC traditional
check, PATH parsing) against fakes — including a real (not
mocked-`fetch`) HTTP server in `src/testing/fake-sidecar.ts`, proving
`verify-asr`'s actual multipart request construction works end-to-end.

**None of that is integration evidence for the real ASR pipeline.**
The story's actual L3 requirement — real `whisper-server`, real model,
real recorded audio, on the real target machine(s) — is recorded in
`docs/stories/E12-S030.md`, not fabricated by pointing at the fake
sidecar tests (Testing Boundary / Anti-hallucination Guard: "不得宣稱
ASR 已驗證而實際只跑過 fake 或只檢查檔案存在").
