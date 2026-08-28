import { describe, expect, it, vi } from "vitest";
import {
  AsrTimeoutError,
  AsrUnavailableError,
  FakeTranscriptionProvider,
  WhisperServerProvider,
} from "./provider.js";
import { makeWavBuffer } from "../testing/wav-fixture.js";

describe("FakeTranscriptionProvider", () => {
  it("returns the configured fake text for a normal-length clip", async () => {
    const provider = new FakeTranscriptionProvider("（測試）假結果");
    const wav = makeWavBuffer({ durationMs: 1500 });
    const result = await provider.transcribe({
      wav,
      language: "zh",
      timeoutMs: 1000,
      correlationId: "corr-1",
    });
    expect(result.rawText).toBe("（測試）假結果");
    expect(result.language).toBe("zh");
  });

  it("returns an empty string for a clip shorter than 300ms", async () => {
    const provider = new FakeTranscriptionProvider("（測試）假結果");
    const wav = makeWavBuffer({ durationMs: 150 });
    const result = await provider.transcribe({
      wav,
      language: "zh",
      timeoutMs: 1000,
      correlationId: "corr-1",
    });
    expect(result.rawText).toBe("");
  });

  it("is named 'fake'", () => {
    const provider = new FakeTranscriptionProvider("x");
    expect(provider.name).toBe("fake");
  });
});

describe("WhisperServerProvider", () => {
  it("POSTs multipart to {serverUrl}/inference and returns rawText from {text}", async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("http://127.0.0.1:8178/inference");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init!.body as FormData;
      expect(form.get("language")).toBe("zh");
      expect(form.get("response_format")).toBe("json");
      expect(form.get("temperature")).toBe("0");
      return new Response(JSON.stringify({ text: "識別出的文字" }), { status: 200 });
    });

    const provider = new WhisperServerProvider({
      serverUrl: "http://127.0.0.1:8178",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await provider.transcribe({
      wav: makeWavBuffer({ durationMs: 1000 }),
      language: "zh",
      prompt: "以下是台灣繁體中文與英文混合的工作對話。",
      timeoutMs: 5000,
      correlationId: "corr-1",
    });

    expect(result.rawText).toBe("識別出的文字");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("throws AsrUnavailableError when the connection is refused", async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error("connect ECONNREFUSED"), { name: "TypeError" });
    });
    const provider = new WhisperServerProvider({
      serverUrl: "http://127.0.0.1:1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      provider.transcribe({
        wav: makeWavBuffer({ durationMs: 1000 }),
        language: "zh",
        timeoutMs: 1000,
        correlationId: "corr-1",
      }),
    ).rejects.toBeInstanceOf(AsrUnavailableError);
  });

  it("throws AsrUnavailableError on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () => new Response("server error", { status: 500 }));
    const provider = new WhisperServerProvider({
      serverUrl: "http://127.0.0.1:8178",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      provider.transcribe({
        wav: makeWavBuffer({ durationMs: 1000 }),
        language: "zh",
        timeoutMs: 1000,
        correlationId: "corr-1",
      }),
    ).rejects.toBeInstanceOf(AsrUnavailableError);
  });

  it("throws AsrTimeoutError when the fetch aborts with a TimeoutError", async () => {
    const fetchImpl = vi.fn(async () => {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      throw error;
    });
    const provider = new WhisperServerProvider({
      serverUrl: "http://127.0.0.1:8178",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      provider.transcribe({
        wav: makeWavBuffer({ durationMs: 1000 }),
        language: "zh",
        timeoutMs: 10,
        correlationId: "corr-1",
      }),
    ).rejects.toBeInstanceOf(AsrTimeoutError);
  });

  it("throws AsrUnavailableError when the response body has no usable text field", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ oops: true }), { status: 200 }));
    const provider = new WhisperServerProvider({
      serverUrl: "http://127.0.0.1:8178",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      provider.transcribe({
        wav: makeWavBuffer({ durationMs: 1000 }),
        language: "zh",
        timeoutMs: 1000,
        correlationId: "corr-1",
      }),
    ).rejects.toBeInstanceOf(AsrUnavailableError);
  });

  it("is named 'whisper-server' with a default model", () => {
    const provider = new WhisperServerProvider({ serverUrl: "http://127.0.0.1:8178" });
    expect(provider.name).toBe("whisper-server");
    expect(provider.model).toBe("ggml-large-v3-turbo.bin");
  });
});
