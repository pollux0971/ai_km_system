/**
 * WAV header parsing/validation (E12-S031 spec "技術決策" §WAV 驗證).
 * Required format: PCM16, mono, 16000 Hz, 300ms–60s. A RIFF chunk walker
 * (not hardcoded offsets) so a real-world WAV with extra chunks before
 * `data` still parses — apps/web's own encoder (E03-S040) never produces
 * those, but nothing guarantees every future caller uses it.
 */

export type WavRejectionReason =
  | "BAD_WAV_HEADER"
  | "UNSUPPORTED_SAMPLE_RATE"
  | "AUDIO_TOO_LONG"
  | "AUDIO_TOO_SHORT";

export interface ParsedWav {
  readonly sampleRate: number;
  readonly numChannels: number;
  readonly bitsPerSample: number;
  readonly dataSize: number;
  readonly durationMs: number;
}

export class WavValidationError extends Error {
  readonly reason: WavRejectionReason;

  constructor(reason: WavRejectionReason, message: string) {
    super(message);
    this.name = "WavValidationError";
    this.reason = reason;
  }
}

const REQUIRED_SAMPLE_RATE = 16000;
const REQUIRED_BITS_PER_SAMPLE = 16;
const PCM_FORMAT_CODE = 1;
const MIN_DURATION_MS = 300;
const MAX_DURATION_MS = 60000;

interface FmtChunk {
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}

function findChunk(
  buffer: Buffer,
  id: string,
  searchStart: number,
): { dataOffset: number; size: number } | undefined {
  let offset = searchStart;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (chunkId === id) return { dataOffset, size: chunkSize };
    // RIFF chunks are word-aligned: an odd-sized chunk has one pad byte.
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  return undefined;
}

/**
 * Parses a WAV buffer's header. Returns `undefined` (never throws) for
 * anything structurally malformed — callers decide what that means for
 * them (the route rejects it; {@link FakeTranscriptionProvider} treats an
 * unparseable buffer as "can't measure duration, don't special-case it").
 */
export function tryParseWavHeader(
  buffer: Buffer,
): { fmt: FmtChunk; dataSize: number } | undefined {
  if (buffer.length < 12) return undefined;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return undefined;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return undefined;

  const fmtChunk = findChunk(buffer, "fmt ", 12);
  if (!fmtChunk || fmtChunk.dataOffset + 16 > buffer.length) return undefined;
  const fmt: FmtChunk = {
    audioFormat: buffer.readUInt16LE(fmtChunk.dataOffset),
    numChannels: buffer.readUInt16LE(fmtChunk.dataOffset + 2),
    sampleRate: buffer.readUInt32LE(fmtChunk.dataOffset + 4),
    bitsPerSample: buffer.readUInt16LE(fmtChunk.dataOffset + 14),
  };

  const dataChunk = findChunk(buffer, "data", 12);
  if (!dataChunk) return undefined;
  // Tolerate a `data` chunk whose declared size overruns a truncated
  // buffer (clamp rather than reject) — the route separately enforces the
  // real byte-size cap (413) before this ever runs.
  const dataSize = Math.max(0, Math.min(dataChunk.size, buffer.length - dataChunk.dataOffset));

  return { fmt, dataSize };
}

function durationMsOf(fmt: FmtChunk, dataSize: number): number {
  const bytesPerSecond = fmt.sampleRate * fmt.numChannels * (fmt.bitsPerSample / 8);
  if (bytesPerSecond <= 0) return 0;
  return (dataSize / bytesPerSecond) * 1000;
}

/** Throws {@link WavValidationError} with the exact contract `reason` on any violation. */
export function parseAndValidateWav(buffer: Buffer): ParsedWav {
  const parsed = tryParseWavHeader(buffer);
  if (!parsed) {
    throw new WavValidationError("BAD_WAV_HEADER", "錄音格式不正確,請重新錄製。");
  }
  const { fmt, dataSize } = parsed;

  if (fmt.audioFormat !== PCM_FORMAT_CODE || fmt.bitsPerSample !== REQUIRED_BITS_PER_SAMPLE) {
    throw new WavValidationError("BAD_WAV_HEADER", "錄音格式不正確,請重新錄製。");
  }
  if (fmt.numChannels !== 1) {
    throw new WavValidationError("BAD_WAV_HEADER", "錄音格式不正確,請重新錄製。");
  }
  if (fmt.sampleRate !== REQUIRED_SAMPLE_RATE) {
    throw new WavValidationError("UNSUPPORTED_SAMPLE_RATE", "錄音取樣率不支援,需為 16kHz。");
  }

  const durationMs = durationMsOf(fmt, dataSize);
  if (durationMs > MAX_DURATION_MS) {
    throw new WavValidationError("AUDIO_TOO_LONG", "錄音時間過長,請縮短在 60 秒以內。");
  }
  if (durationMs < MIN_DURATION_MS) {
    throw new WavValidationError("AUDIO_TOO_SHORT", "錄音時間過短,請再說一次。");
  }

  return {
    sampleRate: fmt.sampleRate,
    numChannels: fmt.numChannels,
    bitsPerSample: fmt.bitsPerSample,
    dataSize,
    durationMs,
  };
}
