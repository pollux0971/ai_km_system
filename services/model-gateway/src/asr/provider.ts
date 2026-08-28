/**
 * `TranscriptionProvider` abstraction (E12-S031 spec "技術決策", ADR 0004
 * §2): `WhisperServerProvider` calls the real whisper.cpp `whisper-server`
 * sidecar; `FakeTranscriptionProvider` is unit/E2E-only and must never be
 * presented as ASR integration evidence.
 */
import { tryParseWavHeader } from "./wav.js";

export type TranscriptionLanguage = "zh" | "en";
export type TranscriptionProviderName = "whisper-server" | "fake";

export interface TranscribeInput {
  readonly wav: Buffer;
  readonly language: TranscriptionLanguage;
  readonly prompt?: string;
  readonly timeoutMs: number;
  readonly correlationId: string;
}

export interface TranscribeResult {
  readonly rawText: string;
  readonly language: TranscriptionLanguage;
  readonly segments?: readonly unknown[];
}

export interface TranscriptionProvider {
  readonly name: TranscriptionProviderName;
  readonly model: string;
  transcribe(input: TranscribeInput): Promise<TranscribeResult>;
}

/** The sidecar refused the connection, or responded with a non-2xx status. */
export class AsrUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsrUnavailableError";
  }
}

/** The sidecar did not respond within the request's `timeoutMs` budget. */
export class AsrTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsrTimeoutError";
  }
}

export interface WhisperServerProviderOptions {
  readonly serverUrl: string;
  readonly model?: string;
  /** Overridden by tests to avoid a real network call. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Real adapter: `POST {serverUrl}/inference`, multipart
 * (`file`/`language`/`prompt`/`response_format=json`/`temperature=0`), per
 * whisper.cpp's documented `examples/server` API. Its JSON response shape
 * is `{text: string}` — the one field this adapter actually depends on;
 * anything else in the response is ignored rather than assumed.
 */
export class WhisperServerProvider implements TranscriptionProvider {
  readonly name = "whisper-server" as const;
  readonly model: string;
  private readonly serverUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: WhisperServerProviderOptions) {
    this.serverUrl = options.serverUrl;
    this.model = options.model ?? "ggml-large-v3-turbo.bin";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
    const form = new FormData();
    form.append("file", new Blob([input.wav], { type: "audio/wav" }), "audio.wav");
    form.append("language", input.language);
    if (input.prompt) form.append("prompt", input.prompt);
    form.append("response_format", "json");
    form.append("temperature", "0");

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.serverUrl}/inference`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(input.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new AsrTimeoutError("語音辨識逾時,請再試一次。");
      }
      throw new AsrUnavailableError("語音辨識服務目前無法使用,請改用鍵盤輸入。");
    }

    if (!response.ok) {
      throw new AsrUnavailableError("語音辨識服務目前無法使用,請改用鍵盤輸入。");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AsrUnavailableError("語音辨識服務目前無法使用,請改用鍵盤輸入。");
    }
    const text = (body as { text?: unknown } | null)?.text;
    if (typeof text !== "string") {
      throw new AsrUnavailableError("語音辨識服務目前無法使用,請改用鍵盤輸入。");
    }

    return { rawText: text, language: input.language };
  }
}

const MIN_SPEECH_DURATION_MS = 300;

/**
 * Unit/E2E-only. Refuses to be enabled in production —
 * {@link resolveModelGatewayConfig} in `../config.js` enforces that at
 * startup, not here (this class has no notion of environment).
 */
export class FakeTranscriptionProvider implements TranscriptionProvider {
  readonly name = "fake" as const;
  readonly model = "fake";
  private readonly fakeText: string;

  constructor(fakeText: string) {
    this.fakeText = fakeText;
  }

  async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
    const parsed = tryParseWavHeader(input.wav);
    if (parsed) {
      const bytesPerSecond = parsed.fmt.sampleRate * parsed.fmt.numChannels * (parsed.fmt.bitsPerSample / 8);
      const durationMs = bytesPerSecond > 0 ? (parsed.dataSize / bytesPerSecond) * 1000 : 0;
      if (durationMs < MIN_SPEECH_DURATION_MS) {
        return { rawText: "", language: input.language };
      }
    }
    return { rawText: this.fakeText, language: input.language };
  }
}
