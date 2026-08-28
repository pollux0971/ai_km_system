import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * E03-S038: a fake microphone WAV for Chromium's
 * `--use-file-for-fake-audio-capture` flag (playwright.config.ts). Generated
 * fresh into an os.tmpdir() directory — never committed to git — so
 * push-to-talk specs (E03-S041+) get a real, decodable audio capture
 * without depending on a checked-in binary fixture.
 *
 * `ensureFakeMicrophoneWav()` is called directly at `playwright.config.ts`'s
 * module top level (synchronously, before `defineConfig()` builds the
 * config object) rather than wired through Playwright's own `globalSetup`
 * hook — `globalSetup` runs AFTER the config module has already been
 * evaluated once to build the static config Playwright's workers use, so a
 * path it produced could never reach `use.launchOptions.args` (which must
 * already be a concrete array by then). Calling this at module load time is
 * the only point early enough.
 *
 * 1.5s of a 440Hz sine tone (audible, non-silent — proves the fake capture
 * device is actually producing samples, not just a zeroed buffer) followed
 * by a 0.5s silence tail (gives push-to-talk's own silence-detection logic,
 * if any, something realistic to observe at the end of a "recording").
 * `%noloop` (appended by whichever spec/config passes this path to Chromium)
 * means the file plays once and then reports end-of-stream — this generator
 * does not need to loop the content itself.
 */
const SAMPLE_RATE = 16000;
const TONE_SECONDS = 1.5;
const SILENCE_SECONDS = 0.5;
const TONE_HZ = 440;
const AMPLITUDE = 0.5; // of full-scale int16 — avoids clipping, still clearly audible.

function buildFakeMicrophoneWav(): Buffer {
  const toneSamples = Math.round(SAMPLE_RATE * TONE_SECONDS);
  const silenceSamples = Math.round(SAMPLE_RATE * SILENCE_SECONDS);
  const totalSamples = toneSamples + silenceSamples;
  const dataSize = totalSamples * 2; // 16-bit mono = 2 bytes/sample.

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size (PCM).
  header.writeUInt16LE(1, 20); // audio format 1 = PCM.
  header.writeUInt16LE(1, 22); // mono.
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate = sampleRate * blockAlign.
  header.writeUInt16LE(2, 32); // block align = channels * bytesPerSample.
  header.writeUInt16LE(16, 34); // bits per sample.
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  const data = Buffer.alloc(dataSize);
  const maxInt16 = 32767;
  for (let i = 0; i < toneSamples; i++) {
    const t = i / SAMPLE_RATE;
    const sample = Math.round(AMPLITUDE * maxInt16 * Math.sin(2 * Math.PI * TONE_HZ * t));
    data.writeInt16LE(sample, i * 2);
  }
  // Remaining `silenceSamples` stay zeroed (Buffer.alloc default) — the silence tail.

  return Buffer.concat([header, data]);
}

let cachedPath: string | undefined;

/**
 * Idempotent within a single Playwright CLI process (module-level cache) —
 * `playwright.config.ts` calls this once at load time; a spec that also
 * wants the path (e.g. to assert on file size) can call it again safely.
 */
export function ensureFakeMicrophoneWav(): string {
  if (cachedPath && existsSync(cachedPath)) return cachedPath;
  const dir = mkdtempSync(path.join(tmpdir(), "ai-km-e2e-fake-mic-"));
  const wavPath = path.join(dir, "fake-microphone.wav");
  writeFileSync(wavPath, buildFakeMicrophoneWav());
  cachedPath = wavPath;
  return wavPath;
}
