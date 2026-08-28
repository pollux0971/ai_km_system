import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./api";
import { transcribeAudio } from "./transcription";

/**
 * These tests spy on `apiClient.transcriptions.POST` directly instead of
 * going through the shared `fake-api.ts` fetch simulation the rest of
 * apps/web's lib tests use.
 *
 * Reason (verified, not assumed): jsdom's `Blob` has no working byte-read
 * path when it ends up inside a `FormData` embedded in a `Request` —
 * `request.formData()`/`.text()`/`.arrayBuffer()`, and even reading
 * `request.body`'s raw `ReadableStream` directly, all hang forever (not
 * throw) the moment ANY `Blob` — regardless of size or content — is part
 * of the body, in this exact jsdom/vitest environment. This reproduces
 * with zero apps/web code involved (a bare `new Request(url, {body:
 * new FormData().set("x", new Blob([...]))})` then `.text()`), and does
 * NOT reproduce with a plain string body, isolating it to jsdom's Blob
 * support specifically (`Blob.prototype.arrayBuffer` doesn't even exist
 * on jsdom's Blob — same root cause E03-S040 hit and worked around with
 * `FileReader` for ITS OWN test assertions; here the missing method is
 * needed by JSDOM'S OWN internal multipart encoder while *reading back* a
 * Request's body, which a FileReader-based polyfill on `Blob.prototype`
 * does not fix — verified empirically, still hangs).
 *
 * `transcribeAudio`'s own production code is unchanged by this — it
 * still builds a real `FormData` with a real `Blob` and calls
 * `apiClient.transcriptions.POST`, exactly as a real browser (where
 * Blob/FormData/fetch all work correctly) requires. Spying on `.POST`
 * intercepts before openapi-fetch ever constructs the problematic
 * `Request`, so these tests exercise transcription.ts's own logic (what
 * it sends, how it maps the Result) without needing a working
 * jsdom Blob body round-trip. `apps/web/src/test/fake-api.ts`'s
 * `/transcriptions` handler is still real, contract-validated
 * infrastructure — usable by a real-browser E2E (E03-S038/E03-S044, not
 * jsdom) where this limitation does not apply.
 */

function wavBlob(): Blob {
  return new Blob([new Uint8Array(64)], { type: "audio/wav" });
}

function fakePostResult(overrides: Partial<Record<string, unknown>> = {}) {
  const body = {
    text: "明天 deadline 確認",
    rawText: "明天 deadline 確認",
    language: "zh",
    durationMs: 1500,
    processingMs: 300,
    provider: "fake",
    model: "fake-model",
    ...overrides,
  };
  return { data: body, error: undefined, response: new Response(JSON.stringify(body), { status: 200 }) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("transcribeAudio", () => {
  it("sends a FormData body with the audio blob, language, and (when given) conversationId", async () => {
    const spy = vi.spyOn(apiClient.transcriptions, "POST").mockResolvedValue(fakePostResult() as never);

    await transcribeAudio(wavBlob(), { language: "zh", conversationId: "11111111-1111-1111-1111-111111111111" });

    expect(spy).toHaveBeenCalledOnce();
    const [path, init] = spy.mock.calls[0]!;
    expect(path).toBe("/transcriptions");
    const formData = (init as unknown as { body: FormData }).body;
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get("audio")).toBeInstanceOf(Blob);
    expect(formData.get("language")).toBe("zh");
    expect(formData.get("conversationId")).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("omits conversationId from the FormData when not provided", async () => {
    const spy = vi.spyOn(apiClient.transcriptions, "POST").mockResolvedValue(fakePostResult() as never);

    await transcribeAudio(wavBlob());

    const [, init] = spy.mock.calls[0]!;
    const formData = (init as unknown as { body: FormData }).body;
    expect(formData.has("conversationId")).toBe(false);
    expect(formData.get("language")).toBe("zh"); // default
  });

  it("resolves ok with the Transcription on success", async () => {
    vi.spyOn(apiClient.transcriptions, "POST").mockResolvedValue(fakePostResult() as never);

    const result = await transcribeAudio(wavBlob());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toBe("明天 deadline 確認");
      expect(result.value.provider).toBe("fake");
    }
  });

  it("resolves ok with an empty text (no speech recognized) — not an error", async () => {
    vi.spyOn(apiClient.transcriptions, "POST").mockResolvedValue(fakePostResult({ text: "", rawText: "" }) as never);

    const result = await transcribeAudio(wavBlob());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.text).toBe("");
  });

  it("surfaces a 503 ASR_UNAVAILABLE error as a Result error", async () => {
    const errorBody = { code: "ASR_UNAVAILABLE", message: "語音辨識服務目前無法使用,請改用鍵盤輸入。" };
    vi.spyOn(apiClient.transcriptions, "POST").mockResolvedValue({
      data: undefined,
      error: errorBody,
      response: new Response(JSON.stringify(errorBody), { status: 503 }),
    } as never);

    const result = await transcribeAudio(wavBlob());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ASR_UNAVAILABLE");
  });

  it("surfaces a 504 ASR_TIMEOUT error as a Result error", async () => {
    const errorBody = { code: "ASR_TIMEOUT", message: "語音辨識逾時,請再試一次。" };
    vi.spyOn(apiClient.transcriptions, "POST").mockResolvedValue({
      data: undefined,
      error: errorBody,
      response: new Response(JSON.stringify(errorBody), { status: 504 }),
    } as never);

    const result = await transcribeAudio(wavBlob());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ASR_TIMEOUT");
  });

  it("surfaces a 400 VALIDATION_ERROR with details.reason=AUDIO_TOO_SHORT", async () => {
    const errorBody = {
      code: "VALIDATION_ERROR",
      message: "錄音時間過短,請再說一次。",
      details: { reason: "AUDIO_TOO_SHORT" },
    };
    vi.spyOn(apiClient.transcriptions, "POST").mockResolvedValue({
      data: undefined,
      error: errorBody,
      response: new Response(JSON.stringify(errorBody), { status: 400 }),
    } as never);

    const result = await transcribeAudio(wavBlob());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.details?.reason).toBe("AUDIO_TOO_SHORT");
    }
  });
});
