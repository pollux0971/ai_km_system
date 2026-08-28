import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { buildTestApp, TEST_USER_HEADER } from "../testing/build-test-app.js";
import { makeMultipartRequest } from "../testing/multipart-fixture.js";
import { makeGarbageBuffer, makeWavBuffer } from "../testing/wav-fixture.js";
import { FakeTranscriptionProvider, WhisperServerProvider } from "../asr/provider.js";
import { loadTranscriptionsContract, expectResponseMatchesContract } from "../testing/contract-check.js";

const URL_PATH = "/v1/transcriptions";
// contracts/openapi/transcriptions.yaml's `paths:` keys are relative to
// `servers: [{url: /v1}]` — the `/v1` prefix is NOT part of the path key.
const CONTRACT_PATH = "/transcriptions";

function authHeaders(userId = "u1"): Record<string, string> {
  return { [TEST_USER_HEADER]: userId };
}

let openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    openServers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  openServers = [];
});

describe("POST /v1/transcriptions", () => {
  it("AC1: valid 16k mono PCM16 WAV + fake provider -> 200 with normalized text", async () => {
    const { app } = await buildTestApp(new FakeTranscriptionProvider("这是假结果"));
    const { payload, headers } = makeMultipartRequest({
      audio: { buffer: makeWavBuffer({ durationMs: 1500 }) },
      language: "zh",
    });

    const response = await app.inject({
      method: "POST",
      url: URL_PATH,
      headers: { ...authHeaders(), ...headers },
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.text).toBe("這是假結果"); // fake text run through normalizeTranscript (OpenCC)
    expect(body.rawText).toBe("这是假结果");
    expect(body.provider).toBe("fake");
    expect(body.durationMs).toBeGreaterThan(1500 - 5);
    expect(body.durationMs).toBeLessThan(1500 + 5);
    expect(typeof body.processingMs).toBe("number");

    const registry = await loadTranscriptionsContract();
    expectResponseMatchesContract(registry, CONTRACT_PATH, "POST", 200, body);
  });

  describe("AC2: malformed clips -> 400 with the matching reason (contract-checked)", () => {
    it.each([
      ["44.1kHz", () => makeWavBuffer({ durationMs: 1000, sampleRate: 44100 }), "UNSUPPORTED_SAMPLE_RATE"],
      ["stereo", () => makeWavBuffer({ durationMs: 1000, numChannels: 2 }), "BAD_WAV_HEADER"],
      ["non-PCM16 (8-bit)", () => makeWavBuffer({ durationMs: 1000, bitsPerSample: 8 }), "BAD_WAV_HEADER"],
      ["garbage/bad header", () => makeGarbageBuffer(), "BAD_WAV_HEADER"],
    ] as const)("%s -> 400 details.reason=%s", async (_label, makeBuffer, reason) => {
      const { app } = await buildTestApp(new FakeTranscriptionProvider("x"));
      const { payload, headers } = makeMultipartRequest({ audio: { buffer: makeBuffer() } });

      const response = await app.inject({
        method: "POST",
        url: URL_PATH,
        headers: { ...authHeaders(), ...headers },
        payload,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.details.reason).toBe(reason);

      const registry = await loadTranscriptionsContract();
      expectResponseMatchesContract(registry, CONTRACT_PATH, "POST", 400, body);
    });

    it("> 4 MiB -> 413 PAYLOAD_TOO_LARGE", async () => {
      const { app } = await buildTestApp(new FakeTranscriptionProvider("x"));
      const oversized = Buffer.alloc(4 * 1024 * 1024 + 1024, 0x42);
      const { payload, headers } = makeMultipartRequest({
        audio: { buffer: oversized, contentType: "audio/wav" },
      });

      const response = await app.inject({
        method: "POST",
        url: URL_PATH,
        headers: { ...authHeaders(), ...headers },
        payload,
      });

      expect(response.statusCode).toBe(413);
      const body = response.json();
      expect(body.code).toBe("PAYLOAD_TOO_LARGE");

      const registry = await loadTranscriptionsContract();
      expectResponseMatchesContract(registry, CONTRACT_PATH, "POST", 413, body);
    });

    it("non-WAV MIME type -> 415 UNSUPPORTED_MEDIA_TYPE", async () => {
      const { app } = await buildTestApp(new FakeTranscriptionProvider("x"));
      const { payload, headers } = makeMultipartRequest({
        audio: { buffer: Buffer.from("not audio"), contentType: "text/plain" },
      });

      const response = await app.inject({
        method: "POST",
        url: URL_PATH,
        headers: { ...authHeaders(), ...headers },
        payload,
      });

      expect(response.statusCode).toBe(415);
      const body = response.json();
      expect(body.code).toBe("UNSUPPORTED_MEDIA_TYPE");

      const registry = await loadTranscriptionsContract();
      expectResponseMatchesContract(registry, CONTRACT_PATH, "POST", 415, body);
    });

    it("request is not multipart/form-data at all (e.g. a JSON body) -> 415", async () => {
      const { app } = await buildTestApp(new FakeTranscriptionProvider("x"));
      const response = await app.inject({
        method: "POST",
        url: URL_PATH,
        headers: { ...authHeaders(), "content-type": "application/json" },
        payload: JSON.stringify({ audio: "not-really-audio" }),
      });
      expect(response.statusCode).toBe(415);
      expect(response.json().code).toBe("UNSUPPORTED_MEDIA_TYPE");
    });

    it("missing audio field -> 400 MISSING_AUDIO", async () => {
      const { app } = await buildTestApp(new FakeTranscriptionProvider("x"));
      const { payload, headers } = makeMultipartRequest({ language: "zh" });

      const response = await app.inject({
        method: "POST",
        url: URL_PATH,
        headers: { ...authHeaders(), ...headers },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().details.reason).toBe("MISSING_AUDIO");
    });
  });

  describe("AC3: duration bounds", () => {
    it("61s clip -> 400 AUDIO_TOO_LONG", async () => {
      const { app } = await buildTestApp(new FakeTranscriptionProvider("x"));
      const { payload, headers } = makeMultipartRequest({
        audio: { buffer: makeWavBuffer({ durationMs: 61000 }) },
      });
      const response = await app.inject({
        method: "POST",
        url: URL_PATH,
        headers: { ...authHeaders(), ...headers },
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().details.reason).toBe("AUDIO_TOO_LONG");
    });

    it("200ms clip -> 400 AUDIO_TOO_SHORT", async () => {
      const { app } = await buildTestApp(new FakeTranscriptionProvider("x"));
      const { payload, headers } = makeMultipartRequest({
        audio: { buffer: makeWavBuffer({ durationMs: 200 }) },
      });
      const response = await app.inject({
        method: "POST",
        url: URL_PATH,
        headers: { ...authHeaders(), ...headers },
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().details.reason).toBe("AUDIO_TOO_SHORT");
    });
  });

  describe("AC4: whisper-server provider failure mapping (real network, no mocked fetch)", () => {
    it("connection refused (nothing listening) -> 503 ASR_UNAVAILABLE", async () => {
      // Port 1 is a privileged/reserved port nothing listens on in this
      // sandbox — a real, unmocked ECONNREFUSED.
      const provider = new WhisperServerProvider({ serverUrl: "http://127.0.0.1:1" });
      const { app } = await buildTestApp(provider, { timeoutMs: 2000 });
      const { payload, headers } = makeMultipartRequest({
        audio: { buffer: makeWavBuffer({ durationMs: 1000 }) },
      });

      const response = await app.inject({
        method: "POST",
        url: URL_PATH,
        headers: { ...authHeaders(), ...headers },
        payload,
      });

      expect(response.statusCode).toBe(503);
      const body = response.json();
      expect(body.code).toBe("ASR_UNAVAILABLE");

      const registry = await loadTranscriptionsContract();
      expectResponseMatchesContract(registry, CONTRACT_PATH, "POST", 503, body);
    });

    it("response delayed past timeoutMs -> 504 ASR_TIMEOUT, and the socket is aborted server-side", async () => {
      let serverSawSocketClose = false;
      const server = createServer((req) => {
        // Deliberately never call res.end() / res.write() — simulates a
        // wedged sidecar. Drain the request body so nothing backs up.
        req.resume();
      });
      server.on("connection", (socket) => {
        // The reliable, version-independent signal that the client (the
        // fetch call, aborted by AbortSignal.timeout()) actually tore down
        // the TCP connection rather than us imagining it based on the HTTP
        // response we got back — `req`-level 'aborted' only fires for a
        // request whose *body* transfer was interrupted, which does not
        // apply here (our small WAV body finishes sending well before the
        // timeout; what gets aborted is waiting for the *response*).
        socket.on("close", () => {
          serverSawSocketClose = true;
        });
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      openServers.push(server);
      const address = server.address();
      if (typeof address !== "object" || address === null) throw new Error("no server address");
      const serverUrl = `http://127.0.0.1:${address.port}`;

      const provider = new WhisperServerProvider({ serverUrl });
      const { app } = await buildTestApp(provider, { timeoutMs: 150 });
      const { payload, headers } = makeMultipartRequest({
        audio: { buffer: makeWavBuffer({ durationMs: 1000 }) },
      });

      const response = await app.inject({
        method: "POST",
        url: URL_PATH,
        headers: { ...authHeaders(), ...headers },
        payload,
      });

      expect(response.statusCode).toBe(504);
      const body = response.json();
      expect(body.code).toBe("ASR_TIMEOUT");

      // Give the socket's 'close' event a moment to fire — it propagates
      // asynchronously relative to the provider's own thrown-error path.
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(serverSawSocketClose).toBe(true);

      const registry = await loadTranscriptionsContract();
      expectResponseMatchesContract(registry, CONTRACT_PATH, "POST", 504, body);
    });
  });

  describe("AC6: auth and conversationId", () => {
    it("no session -> 401 UNAUTHENTICATED", async () => {
      const { app } = await buildTestApp(new FakeTranscriptionProvider("x"));
      const { payload, headers } = makeMultipartRequest({
        audio: { buffer: makeWavBuffer({ durationMs: 1000 }) },
      });
      const response = await app.inject({ method: "POST", url: URL_PATH, headers, payload });
      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.code).toBe("UNAUTHENTICATED");

      const registry = await loadTranscriptionsContract();
      expectResponseMatchesContract(registry, CONTRACT_PATH, "POST", 401, body);
    });

    it("a malformed conversationId is dropped, not rejected (see EVIDENCE assumptions)", async () => {
      const { app } = await buildTestApp(new FakeTranscriptionProvider("x"));
      const { payload, headers } = makeMultipartRequest({
        audio: { buffer: makeWavBuffer({ durationMs: 1000 }) },
        conversationId: "not-a-uuid",
      });
      const response = await app.inject({
        method: "POST",
        url: URL_PATH,
        headers: { ...authHeaders(), ...headers },
        payload,
      });
      expect(response.statusCode).toBe(200);
    });

    it("a valid conversationId is accepted and reaches telemetry", async () => {
      const { app, telemetryLog } = await buildTestApp(new FakeTranscriptionProvider("x"));
      const { payload, headers } = makeMultipartRequest({
        audio: { buffer: makeWavBuffer({ durationMs: 1000 }) },
        conversationId: "11111111-1111-1111-1111-111111111111",
      });
      const response = await app.inject({
        method: "POST",
        url: URL_PATH,
        headers: { ...authHeaders(), ...headers },
        payload,
      });
      expect(response.statusCode).toBe(200);
      expect(telemetryLog[0]?.fields.conversationId).toBe("11111111-1111-1111-1111-111111111111");
    });
  });

  describe("AC7: telemetry never contains text", () => {
    it("logs metadata only — no `text`/`rawText` field, and the fake text is not embedded in any logged value", async () => {
      const fakeText = "極機密的辨識文字內容";
      const { app, telemetryLog } = await buildTestApp(new FakeTranscriptionProvider(fakeText));
      const { payload, headers } = makeMultipartRequest({
        audio: { buffer: makeWavBuffer({ durationMs: 1000 }) },
      });

      await app.inject({
        method: "POST",
        url: URL_PATH,
        headers: { ...authHeaders(), ...headers },
        payload,
      });

      expect(telemetryLog).toHaveLength(1);
      const entry = telemetryLog[0]!;
      expect(entry.fields).not.toHaveProperty("text");
      expect(entry.fields).not.toHaveProperty("rawText");
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain(fakeText);
      expect(entry.fields).toMatchObject({
        provider: "fake",
        model: "fake",
      });
      expect(typeof entry.fields.textLength).toBe("number");
    });
  });
});
