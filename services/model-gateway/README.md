# services/model-gateway

Owner: **Team B** — E12 Model & Prompt Platform.

All model calls (local or, if explicitly enabled, external) route through
here. Prompt versioning lives here. Not yet scaffolded.

**2026-08-28:** the user assigned Team A E12-S029～S031
(`@ai-km/service-model-gateway`: `TranscriptionProvider` abstraction,
whisper.cpp `whisper-server` adapter, fake provider, `/v1/transcriptions`) —
see `docs/adr/0004-asr-runtime-whisper-cpp.md`. Text/vision generation
adapters and prompt registry remain Team B.
