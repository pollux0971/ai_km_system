import { describe, expect, it } from "vitest";
import { resampleLinear } from "./resample";

describe("resampleLinear", () => {
  it("returns the input unchanged when rates already match", () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    expect(resampleLinear(input, 16000, 16000)).toBe(input);
  });

  it("returns the (empty) input unchanged", () => {
    const input = new Float32Array(0);
    expect(resampleLinear(input, 48000, 16000)).toBe(input);
  });

  it("downsamples 48kHz to 16000Hz to roughly a third of the length", () => {
    const input = new Float32Array(48000); // 1s of samples
    const output = resampleLinear(input, 48000, 16000);
    expect(output.length).toBe(16000);
  });

  it("upsamples, preserving the first/last sample and interpolating monotonically in between", () => {
    const input = new Float32Array([0, 10]);
    const output = resampleLinear(input, 1, 5);

    expect(output.length).toBe(10);
    expect(output[0]).toBeCloseTo(0);
    expect(output[output.length - 1]).toBeCloseTo(10);
    for (let i = 1; i < output.length; i += 1) {
      expect(output[i]).toBeGreaterThanOrEqual(output[i - 1]!);
    }
  });

  it("preserves a constant signal's amplitude", () => {
    const input = new Float32Array(100).fill(0.7);
    const output = resampleLinear(input, 48000, 16000);
    for (const sample of output) {
      expect(sample).toBeCloseTo(0.7);
    }
  });
});
