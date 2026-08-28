import { describe, expect, it } from "vitest";
import { encodeWav } from "./wav";

// jsdom's Blob polyfill only implements FileReader, not `.arrayBuffer()`.
function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe("encodeWav (E03-S040 AC8: golden byte-exact header)", () => {
  it("produces a bit-exact RIFF/WAVE/fmt/data header + PCM16 samples for a known input", async () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const blob = encodeWav(samples, 16000);

    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + 5 * 2);

    const bytes = new Uint8Array(await readBlobAsArrayBuffer(blob));

    const expected = [
      // "RIFF"
      0x52, 0x49, 0x46, 0x46,
      // chunk size = 36 + dataSize(10) = 46
      46, 0, 0, 0,
      // "WAVE"
      0x57, 0x41, 0x56, 0x45,
      // "fmt "
      0x66, 0x6d, 0x74, 0x20,
      // fmt chunk size = 16
      16, 0, 0, 0,
      // audio format = 1 (PCM)
      1, 0,
      // channels = 1
      1, 0,
      // sample rate = 16000 (0x3E80)
      0x80, 0x3e, 0, 0,
      // byte rate = 16000*1*2 = 32000 (0x7D00)
      0x00, 0x7d, 0, 0,
      // block align = 2
      2, 0,
      // bits per sample = 16
      16, 0,
      // "data"
      0x64, 0x61, 0x74, 0x61,
      // data size = 10
      10, 0, 0, 0,
      // samples, PCM16 LE:
      // 0 -> 0
      0, 0,
      // 0.5 -> round(0.5*32767) = 16384 (0x4000)
      0x00, 0x40,
      // -0.5 -> round(-0.5*32768) = -16384 (0xC000)
      0x00, 0xc0,
      // 1 -> 32767 (0x7FFF)
      0xff, 0x7f,
      // -1 -> -32768 (0x8000)
      0x00, 0x80,
    ];

    expect(Array.from(bytes)).toEqual(expected);
  });

  it("clamps out-of-range samples instead of overflowing/wrapping", async () => {
    const samples = new Float32Array([2, -2]);
    const blob = encodeWav(samples, 16000);
    const view = new DataView(await readBlobAsArrayBuffer(blob));

    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it("produces an empty data chunk for zero samples", async () => {
    const blob = encodeWav(new Float32Array(0), 16000);
    expect(blob.size).toBe(44);
    const view = new DataView(await readBlobAsArrayBuffer(blob));
    expect(view.getUint32(40, true)).toBe(0);
  });
});
