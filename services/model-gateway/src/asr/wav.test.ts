import { describe, expect, it } from "vitest";
import { parseAndValidateWav, tryParseWavHeader, WavValidationError } from "./wav.js";
import { makeGarbageBuffer, makeWavBuffer } from "../testing/wav-fixture.js";

describe("parseAndValidateWav", () => {
  it("accepts a valid 16kHz mono PCM16 WAV within duration bounds", () => {
    const buffer = makeWavBuffer({ durationMs: 1500 });
    const parsed = parseAndValidateWav(buffer);
    expect(parsed.sampleRate).toBe(16000);
    expect(parsed.numChannels).toBe(1);
    expect(parsed.bitsPerSample).toBe(16);
    expect(parsed.durationMs).toBeGreaterThan(1500 - 5);
    expect(parsed.durationMs).toBeLessThan(1500 + 5);
  });

  it("rejects a completely non-WAV buffer with BAD_WAV_HEADER", () => {
    expect(() => parseAndValidateWav(makeGarbageBuffer())).toThrowError(
      expect.objectContaining({ reason: "BAD_WAV_HEADER" }),
    );
  });

  it("rejects a truncated buffer (no fmt/data chunk) with BAD_WAV_HEADER", () => {
    const buffer = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE")]);
    expect(() => parseAndValidateWav(buffer)).toThrowError(
      expect.objectContaining({ reason: "BAD_WAV_HEADER" }),
    );
  });

  it("rejects non-PCM (e.g. IEEE float) with BAD_WAV_HEADER", () => {
    const buffer = makeWavBuffer({ durationMs: 1000 });
    buffer.writeUInt16LE(3, 20); // audioFormat = 3 (IEEE float), not 1 (PCM)
    expect(() => parseAndValidateWav(buffer)).toThrowError(
      expect.objectContaining({ reason: "BAD_WAV_HEADER" }),
    );
  });

  it("rejects stereo with BAD_WAV_HEADER", () => {
    const buffer = makeWavBuffer({ durationMs: 1000, numChannels: 2 });
    expect(() => parseAndValidateWav(buffer)).toThrowError(
      expect.objectContaining({ reason: "BAD_WAV_HEADER" }),
    );
  });

  it("rejects 8-bit samples with BAD_WAV_HEADER", () => {
    const buffer = makeWavBuffer({ durationMs: 1000, bitsPerSample: 8 });
    expect(() => parseAndValidateWav(buffer)).toThrowError(
      expect.objectContaining({ reason: "BAD_WAV_HEADER" }),
    );
  });

  it("rejects 44.1kHz with UNSUPPORTED_SAMPLE_RATE", () => {
    const buffer = makeWavBuffer({ durationMs: 1000, sampleRate: 44100 });
    expect(() => parseAndValidateWav(buffer)).toThrowError(
      expect.objectContaining({ reason: "UNSUPPORTED_SAMPLE_RATE" }),
    );
  });

  it("rejects a 61-second clip with AUDIO_TOO_LONG", () => {
    const buffer = makeWavBuffer({ durationMs: 61000 });
    expect(() => parseAndValidateWav(buffer)).toThrowError(
      expect.objectContaining({ reason: "AUDIO_TOO_LONG" }),
    );
  });

  it("accepts exactly 60 seconds", () => {
    const buffer = makeWavBuffer({ durationMs: 60000 });
    expect(() => parseAndValidateWav(buffer)).not.toThrow();
  });

  it("rejects a 200ms clip with AUDIO_TOO_SHORT", () => {
    const buffer = makeWavBuffer({ durationMs: 200 });
    expect(() => parseAndValidateWav(buffer)).toThrowError(
      expect.objectContaining({ reason: "AUDIO_TOO_SHORT" }),
    );
  });

  it("accepts exactly 300ms", () => {
    const buffer = makeWavBuffer({ durationMs: 300 });
    expect(() => parseAndValidateWav(buffer)).not.toThrow();
  });

  it("thrown error is a WavValidationError instance", () => {
    try {
      parseAndValidateWav(makeGarbageBuffer());
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(WavValidationError);
    }
  });

  it("finds fmt/data chunks even with an extra chunk (e.g. LIST) before data", () => {
    const base = makeWavBuffer({ durationMs: 1000 });
    const listChunk = Buffer.concat([Buffer.from("LIST"), Buffer.from([4, 0, 0, 0]), Buffer.from("INFO")]);
    // Splice the extra chunk in right after the fmt chunk (offset 36 in a
    // canonical 44-byte header), before "data".
    const withExtraChunk = Buffer.concat([base.subarray(0, 36), listChunk, base.subarray(36)]);
    const parsed = parseAndValidateWav(withExtraChunk);
    expect(parsed.sampleRate).toBe(16000);
  });
});

describe("tryParseWavHeader", () => {
  it("returns undefined (does not throw) for garbage input", () => {
    expect(tryParseWavHeader(makeGarbageBuffer())).toBeUndefined();
  });

  it("returns undefined for an empty buffer", () => {
    expect(tryParseWavHeader(Buffer.alloc(0))).toBeUndefined();
  });

  it("returns the parsed fmt/data for a valid WAV, regardless of validation rules", () => {
    // 44.1kHz would be rejected by parseAndValidateWav, but tryParseWavHeader
    // just reports what the header says.
    const buffer = makeWavBuffer({ durationMs: 500, sampleRate: 44100 });
    const parsed = tryParseWavHeader(buffer);
    expect(parsed?.fmt.sampleRate).toBe(44100);
  });
});
