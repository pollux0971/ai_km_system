/**
 * Test-only WAV fixture builder — generates a synthetic sine wave and
 * encodes it as a RIFF/WAVE PCM buffer with a caller-chosen (possibly
 * invalid, for negative tests) header, so route/provider tests never need
 * a real audio file on disk.
 */

export interface WavFixtureOptions {
  readonly durationMs: number;
  readonly sampleRate?: number;
  readonly numChannels?: number;
  readonly bitsPerSample?: number;
  readonly amplitude?: number;
  readonly frequencyHz?: number;
}

export function makeWavBuffer(options: WavFixtureOptions): Buffer {
  const sampleRate = options.sampleRate ?? 16000;
  const numChannels = options.numChannels ?? 1;
  const bitsPerSample = options.bitsPerSample ?? 16;
  const amplitude = options.amplitude ?? 0.5;
  const frequencyHz = options.frequencyHz ?? 440;
  const bytesPerSample = bitsPerSample / 8;

  const sampleCount = Math.round((options.durationMs / 1000) * sampleRate);
  const dataSize = sampleCount * numChannels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const clamped = Math.max(-1, Math.min(1, amplitude * Math.sin(2 * Math.PI * frequencyHz * t)));
    for (let ch = 0; ch < numChannels; ch += 1) {
      const offset = 44 + (i * numChannels + ch) * bytesPerSample;
      if (bitsPerSample === 8) {
        // 8-bit PCM WAV is conventionally unsigned, centered at 128.
        buffer.writeUInt8(Math.round((clamped * 0.5 + 0.5) * 0xff), offset);
      } else {
        buffer.writeInt16LE(Math.round(clamped * 0x7fff), offset);
      }
    }
  }

  return buffer;
}

/** A buffer that is not a WAV file at all — for BAD_WAV_HEADER tests. */
export function makeGarbageBuffer(size = 100): Buffer {
  return Buffer.alloc(size, 0x41); // "AAAA..."
}
