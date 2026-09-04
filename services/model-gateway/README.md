# services/model-gateway

Owner: **Team B** — E12 Model & Prompt Platform. Text/vision generation
adapters and prompt registry remain Team B and are not yet scaffolded.

**2026-08-28:** the user assigned Team A E12-S029～S031 (ADR 0004,
`docs/adr/0004-asr-runtime-whisper-cpp.md`). E12-S031 (this package's only
implemented slice so far) ships:

- `POST /v1/transcriptions` (`contracts/openapi/transcriptions.yaml`,
  registered from `apps/api/src/server.ts`).
- `TranscriptionProvider` abstraction (`src/asr/provider.ts`):
  `WhisperServerProvider` calls a real whisper.cpp `whisper-server`
  sidecar over HTTP (`POST {AI_KM_ASR_SERVER_URL}/inference`);
  `FakeTranscriptionProvider` is unit/E2E-only and refuses to start in
  production (`src/config.ts`).
- WAV validation (`src/asr/wav.ts`): 16kHz mono PCM16, 300ms–60s.
- Post-processing (`src/asr/normalize.ts`): OpenCC Simplified→Taiwan
  Traditional (`opencc-js`, `cn→twp`) + whitespace cleanup + whisper
  no-speech hallucination filtering.
- SSRF guard: `AI_KM_ASR_SERVER_URL` must resolve to a loopback or
  private-network host, checked at plugin registration.

See `archive/stories/E12-S031.md` for full EVIDENCE (gate output, AC
coverage, and the assumptions this implementation had to make where the
contract/spec left a gap — notably: `apps/api/src/errors.ts` and
`apps/api/src/config.ts` were outside this story's allowed-modify list,
which shaped how errors are surfaced and how config is threaded through).

Real whisper-server integration (L3) needs E12-S030 (ASR environment
readiness) on the same machine — not yet merged as of this story;
`AI_KM_ASR_PROVIDER=fake`/WAV-validation/normalize/error-mapping are all
covered by this package's own unit + route tests without it.
