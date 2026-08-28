/**
 * Linear-interpolation resampler used when the browser ignores the
 * requested `AudioContext({sampleRate:16000})` and yields native audio at
 * a different rate. Pure function.
 */
export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate || input.length === 0) {
    return input;
  }

  const outputLength = Math.round((input.length * toRate) / fromRate);
  const output = new Float32Array(outputLength);
  const ratio = (input.length - 1) / Math.max(1, outputLength - 1);

  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const indexLow = Math.floor(position);
    const indexHigh = Math.min(indexLow + 1, input.length - 1);
    const fraction = position - indexLow;
    const low = input[indexLow] ?? 0;
    const high = input[indexHigh] ?? 0;
    output[i] = low + (high - low) * fraction;
  }

  return output;
}
