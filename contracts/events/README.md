# contracts/events

Shared event contracts (async/eventing between domain services), authored
primarily by the owning Team B domain per event. Team A consumes event
shapes it needs for UI (e.g. notifications) but does not own them. Not yet
populated.

**2026-08-28:** E04-S038 (user-assigned to Team A) adds
`conversation-change-events.md` — the SSE change-event wire format used for
cross-window sync (`docs/adr/0003-api-runtime-sqlite-sse.md` §7).
