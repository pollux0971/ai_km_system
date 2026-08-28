const BYTES_PER_SAMPLE = 2; // PCM16
const NUM_CHANNELS = 1; // mono

function writeAsciiString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function floatSampleToInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
}

/**
 * Encodes mono Float32 PCM samples ([-1, 1]) as a 16-bit RIFF/WAVE `Blob`.
 * Pure function: no side effects, deterministic byte output for a given
 * input (see wav.test.ts golden test).
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataSize = samples.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const byteRate = sampleRate * NUM_CHANNELS * BYTES_PER_SAMPLE;
  const blockAlign = NUM_CHANNELS * BYTES_PER_SAMPLE;

  writeAsciiString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAsciiString(view, 8, "WAVE");

  writeAsciiString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, NUM_CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * BYTES_PER_SAMPLE, true); // bits per sample

  writeAsciiString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0;
    view.setInt16(44 + i * BYTES_PER_SAMPLE, floatSampleToInt16(sample), true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}
