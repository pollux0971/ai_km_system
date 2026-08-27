# Conversation change events (SSE)

Normative wire contract for `GET /v1/conversations/events`, declared in
`contracts/openapi/conversations.yaml`. Authored under **E04-S038**
(user-assigned to Team A on 2026-08-28; E04 domain owner is Team B).
Transport rationale: `docs/adr/0003-api-runtime-sqlite-sse.md` §7.

Consumers: `E03-S039` (cross-window sync client). Producers: `E04-S041`
(conversations REST), `E04-S042` (messages REST), `E04-S043` (feedback),
`E04-S044` (this endpoint).

---

## 1. Why events carry identifiers only

A `ChangeEvent` names *what changed*; it never carries the changed row. A
subscriber reacts by re-fetching the affected resource through the normal
authorized REST endpoint.

This is a security property, not a size optimisation. If payloads rode the
stream, a permission revoked between the write and the read would still be
delivered to a window that is no longer allowed to see it. Re-fetching means
every read goes through `requireSession` + ownership check again, so
**Deny-Wins holds even for data that was legitimately readable one second
earlier**.

## 2. Stream scope and framing

One stream per subscriber, scoped to the session's **owner key**. A stream
never carries another owner's events, and `ChangeEvent.id` is monotonic
*per owner* — it is not a global sequence and two owners will both see an
`id: 1`.

Each frame uses standard SSE framing:

```
id: <ChangeEvent.id>
event: <ChangeEvent.type>
data: <ChangeEvent as compact JSON>

```

(blank line terminates the frame). The `resync` control frame is the one
exception — see §5.

Every 15 seconds an idle stream emits a comment-only heartbeat:

```
:

```

It has no `id:`, so it never advances the client's `Last-Event-ID`. Its only
job is keeping intermediaries from dropping an idle connection.

## 3. Which endpoint emits which event

| Endpoint | Events emitted, in order |
|---|---|
| `POST /conversations` | `conversation.created` |
| `PATCH /conversations/{id}` | `conversation.updated` |
| `DELETE /conversations/{id}` | `conversation.deleted` |
| `POST /conversations/{id}/messages` | `message.created`, then `conversation.updated` |
| `POST .../messages/{mid}/revisions` | `message.updated` |
| `PUT .../messages/{mid}/feedback` | `message.updated` |
| `PUT .../messages/{mid}/feedback/reason` | `message.updated` |
| `PUT .../messages/{mid}/feedback/comment` | `message.updated` |
| `PUT .../citations/{cid}/feedback` | `message.updated` |
| `GET` (any) | none — reads never emit |

**Creating a message emits two events, not one.** The message lands in the
thread *and* the parent conversation's `lastMessageAt` / `lastMessagePreview`
move. A subscriber that only re-fetched the thread would leave a stale
preview and a stale sort position in the sidebar, so the conversation-level
change is announced explicitly rather than left for the client to infer.

`DELETE` emits exactly one `conversation.deleted` even though it also removes
every message in the conversation. Per-message deletion events would be
redundant: the conversation they belong to is gone, and a subscriber that
re-fetched each one would get a 404 storm.

## 4. Writes and events are one transaction

An event row is written in the **same transaction** as the change it
describes. There is no "write, then publish" window: either both land or
neither does. A client therefore never receives an event for a change that
was rolled back, and never misses an event for a change that committed.

## 5. Replay, and when replay is refused

On reconnect the client asks for everything it missed, using either the
standard `Last-Event-ID` request header or the `lastEventId` query parameter
(`EventSource` cannot set headers). When both are present the header wins.

The server replays every event for this owner with `id` **strictly greater
than** the supplied value, then continues live.

If it cannot serve a correct replay it sends a single control frame instead
of a partial one:

```
event: resync
data: {"reason":"EVENT_LOG_TRUNCATED"}

```

`reason` is one of `EVENT_LOG_TRUNCATED` (the requested id is older than the
retained window), `UNKNOWN_LAST_EVENT_ID` (the id was never issued to this
owner — including an id belonging to somebody else) or `SERVER_RESTART`.

A `resync` frame carries **no `id:`**, so it does not advance the client's
`Last-Event-ID`. On receiving it the client must discard local state and
re-fetch the conversation list and any open thread from scratch. Serving a
partial replay here would silently leave the client missing changes forever —
fail closed, resync loudly.

## 6. `originClientId` is a UX hint, never identity

A mutating request may send an `X-Client-Id` header (a UUID the window
generates for itself). If it does, the resulting events echo it back as
`originClientId`, letting the originating window skip re-rendering its own
change.

It is client-supplied and therefore untrusted: it must never be used for
authorization, ownership, auditing, or rate limiting. A client that forges
another window's id achieves nothing except suppressing its own repaint.

## 7. Connection limit

Twenty concurrent streams per owner. The 21st is rejected with HTTP `429` and
body `{"code":"TOO_MANY_CONNECTIONS", ...}` rather than being accepted and
starved, so a leaking client fails visibly instead of degrading everyone.

## 8. Full wire example

Subscriber reconnects having last seen event 40, then somebody sends a
message in another window:

```http
GET /v1/conversations/events HTTP/1.1
Accept: text/event-stream
Last-Event-ID: 40
Cookie: ai_km_session=<opaque>
```

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-store
X-Accel-Buffering: no
```

```
: connected

id: 41
event: conversation.created
data: {"id":41,"type":"conversation.created","conversationId":"8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77","occurredAt":"2026-08-28T05:12:00.000Z","originClientId":"c7c2f0b6-1f9a-4c1e-9f2b-2d3e4f5a6b7c"}

id: 42
event: message.created
data: {"id":42,"type":"message.created","conversationId":"8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77","messageId":"1b6a1f2c-3d4e-4f50-8a61-7c8d9e0f1a2b","occurredAt":"2026-08-28T05:12:04.000Z"}

id: 43
event: conversation.updated
data: {"id":43,"type":"conversation.updated","conversationId":"8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77","occurredAt":"2026-08-28T05:12:04.000Z"}

:

```

Events 42 and 43 are the message-create pair from §3.

## 9. Out of scope

Generation token streaming is **not** on this stream. The user's 2026-08-28
decision is explicit: another window sees a new conversation / new message /
rename / archive / delete, but in-flight generated text is not mirrored.
Generation remains a browser-local concern until real server-side generation
lands in E04.
