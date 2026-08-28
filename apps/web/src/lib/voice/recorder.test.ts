import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceRecorder } from "./recorder";
import type { VoiceAudioContextLike, VoiceRecorderDeps } from "./types";

// ---- Fake clock: deps.now() + deps.setInterval() driven by advance(ms) ----

class FakeClock {
  private currentTime = 0;
  private nextHandle = 1;
  private intervals = new Map<
    number,
    { callback: () => void; intervalMs: number; nextFireAt: number }
  >();

  now = (): number => this.currentTime;

  setInterval = (callback: () => void, intervalMs: number): number => {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.intervals.set(handle, {
      callback,
      intervalMs,
      nextFireAt: this.currentTime + intervalMs,
    });
    return handle;
  };

  clearInterval = (handle: number): void => {
    this.intervals.delete(handle);
  };

  get activeIntervalCount(): number {
    return this.intervals.size;
  }

  advance(totalMs: number): void {
    const target = this.currentTime + totalMs;
    for (;;) {
      let dueHandle: number | null = null;
      let dueAt = Infinity;
      for (const [handle, interval] of this.intervals) {
        if (interval.nextFireAt < dueAt) {
          dueAt = interval.nextFireAt;
          dueHandle = handle;
        }
      }
      if (dueHandle === null || dueAt > target) break;
      this.currentTime = dueAt;
      const interval = this.intervals.get(dueHandle);
      if (!interval) continue;
      interval.nextFireAt += interval.intervalMs;
      interval.callback();
    }
    this.currentTime = target;
  }
}

// ---- Fake Web Audio graph ----

class FakeMediaStreamTrack {
  stop = vi.fn();
}

class FakeMediaStream {
  private tracks: FakeMediaStreamTrack[];
  constructor(trackCount = 1) {
    this.tracks = Array.from({ length: trackCount }, () => new FakeMediaStreamTrack());
  }
  getTracks(): FakeMediaStreamTrack[] {
    return this.tracks;
  }
}

class FakeAudioContext implements VoiceAudioContextLike {
  static instances: FakeAudioContext[] = [];
  sampleRate: number;
  audioWorklet = { addModule: vi.fn(async () => {}) };
  close = vi.fn(async () => {});
  constructor(options?: { sampleRate?: number }) {
    this.sampleRate = options?.sampleRate ?? 16000;
    FakeAudioContext.instances.push(this);
  }
  createMediaStreamSource(): { connect: (dest: unknown) => void } {
    return { connect: vi.fn() };
  }
}

function makeFakeAudioContextClass(nativeSampleRate: number) {
  return class extends FakeAudioContext {
    constructor() {
      super({ sampleRate: nativeSampleRate });
    }
  };
}

class FakeAudioWorkletNode {
  static instances: FakeAudioWorkletNode[] = [];
  port: { onmessage: ((event: MessageEvent) => void) | null } = { onmessage: null };
  connect = vi.fn();
  disconnect = vi.fn();
  constructor() {
    FakeAudioWorkletNode.instances.push(this);
  }
  emit(samples: Float32Array): void {
    this.port.onmessage?.({ data: { samples } } as MessageEvent);
  }
}

interface Harness {
  clock: FakeClock;
  stream: FakeMediaStream;
  getUserMedia: ReturnType<typeof vi.fn>;
  deps: VoiceRecorderDeps;
}

function createHarness(opts?: {
  nativeSampleRate?: number;
  getUserMediaImpl?: () => Promise<FakeMediaStream>;
}): Harness {
  FakeAudioWorkletNode.instances = [];
  FakeAudioContext.instances = [];
  const clock = new FakeClock();
  const stream = new FakeMediaStream();
  const getUserMedia = vi.fn(opts?.getUserMediaImpl ?? (async () => stream));
  const deps: VoiceRecorderDeps = {
    getUserMedia: getUserMedia as unknown as VoiceRecorderDeps["getUserMedia"],
    AudioContext: makeFakeAudioContextClass(
      opts?.nativeSampleRate ?? 16000,
    ) as unknown as VoiceRecorderDeps["AudioContext"],
    AudioWorkletNode: FakeAudioWorkletNode as unknown as VoiceRecorderDeps["AudioWorkletNode"],
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
  };
  return { clock, stream, getUserMedia, deps };
}

function currentWorkletNode(): FakeAudioWorkletNode {
  const node = FakeAudioWorkletNode.instances[FakeAudioWorkletNode.instances.length - 1];
  if (!node) throw new Error("no FakeAudioWorkletNode created yet");
  return node;
}

function currentAudioContext(): FakeAudioContext {
  const context = FakeAudioContext.instances[FakeAudioContext.instances.length - 1];
  if (!context) throw new Error("no FakeAudioContext created yet");
  return context;
}

/** Emits `frames` one at a time, advancing the fake clock in step so
 * interval ticks interleave with frame arrival the way they would in a
 * real recording. */
function feedFrames(harness: Harness, frames: Float32Array[], sampleRate: number): void {
  const node = currentWorkletNode();
  const frameLength = frames[0]?.length ?? 128;
  const msPerFrame = (frameLength / sampleRate) * 1000;
  for (const frame of frames) {
    node.emit(frame);
    harness.clock.advance(msPerFrame);
  }
}

function sineFrames(
  durationMs: number,
  sampleRate: number,
  amplitude: number,
  frameSize = 128,
): Float32Array[] {
  const totalSamples = Math.round((durationMs / 1000) * sampleRate);
  const frequencyHz = 440;
  const frames: Float32Array[] = [];
  for (let start = 0; start < totalSamples; start += frameSize) {
    const length = Math.min(frameSize, totalSamples - start);
    const frame = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const t = (start + i) / sampleRate;
      frame[i] = amplitude * Math.sin(2 * Math.PI * frequencyHz * t);
    }
    frames.push(frame);
  }
  return frames;
}

// jsdom's Blob polyfill only implements FileReader, not `.arrayBuffer()`.
function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function parseWavHeader(blob: Blob): Promise<{
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  sampleCount: number;
}> {
  const buffer = await readBlobAsArrayBuffer(blob);
  const view = new DataView(buffer);
  return {
    numChannels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
    sampleCount: view.getUint32(40, true) / 2,
  };
}

beforeEach(() => {
  vi.stubGlobal("AudioWorkletNode", class {});
  Object.defineProperty(window, "isSecureContext", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn() },
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createVoiceRecorder", () => {
  it("AC1: 48kHz native audio -> manual stop resamples to a valid 16kHz mono PCM16 WAV", async () => {
    const harness = createHarness({ nativeSampleRate: 48000 });
    const recorder = createVoiceRecorder(undefined, harness.deps);

    await recorder.start();
    feedFrames(harness, sineFrames(1500, 48000, 0.5), 48000);

    const capture = await recorder.stop("manual");

    expect(capture).not.toBeNull();
    expect(capture!.sampleRate).toBe(16000);
    expect(capture!.durationMs).toBeGreaterThan(1500 - 40);
    expect(capture!.durationMs).toBeLessThan(1500 + 40);

    const header = await parseWavHeader(capture!.wav);
    expect(header.sampleRate).toBe(16000);
    expect(header.numChannels).toBe(1);
    expect(header.bitsPerSample).toBe(16);
    expect(header.sampleCount).toBeGreaterThan(24000 - 48);
    expect(header.sampleCount).toBeLessThan(24000 + 48);
  });

  it("AC2a: auto-stops with reason 'silence' after minSpeechMs of speech + silenceMs of silence", async () => {
    const harness = createHarness();
    const recorder = createVoiceRecorder(undefined, harness.deps);
    const stateChanges: Array<[string, string | undefined]> = [];
    recorder.onStateChange((state, reason) => stateChanges.push([state, reason]));

    await recorder.start();
    feedFrames(harness, sineFrames(800, 16000, 0.5), 16000);
    feedFrames(harness, sineFrames(1200, 16000, 0), 16000);
    // let any remaining scheduled tick fire
    harness.clock.advance(50);
    // triggerAutoStop() is fire-and-forget: releaseResources() awaits
    // audioContext.close(), so the idle transition lands a few microtask
    // ticks after the fake clock has already advanced past it.
    await vi.waitFor(() => expect(recorder.state).toBe("idle"));

    expect(stateChanges).toContainEqual(["finalizing", "silence"]);
    expect(stateChanges).toContainEqual(["idle", "silence"]);
    expect(recorder.state).toBe("idle");
  });

  it("AC2b: stop() rejects with TOO_SHORT (not an empty WAV) when speech never reached minSpeechMs", async () => {
    const harness = createHarness();
    const recorder = createVoiceRecorder(undefined, harness.deps);

    await recorder.start();
    // 150ms of speech (< minSpeechMs=300ms) then silence, stopped manually.
    feedFrames(harness, sineFrames(150, 16000, 0.5), 16000);
    feedFrames(harness, sineFrames(300, 16000, 0), 16000);

    await expect(recorder.stop("manual")).rejects.toMatchObject({
      code: "TOO_SHORT",
    });
    expect(recorder.state).toBe("idle");
  });

  it("AC3: auto-stops with reason 'max_duration' once maxDurationMs elapses", async () => {
    const harness = createHarness();
    const recorder = createVoiceRecorder({ maxDurationMs: 2000 }, harness.deps);
    const stateChanges: Array<[string, string | undefined]> = [];
    recorder.onStateChange((state, reason) => stateChanges.push([state, reason]));

    await recorder.start();
    feedFrames(harness, sineFrames(2100, 16000, 0.5), 16000);
    await vi.waitFor(() => expect(recorder.state).toBe("idle"));

    expect(stateChanges).toContainEqual(["finalizing", "max_duration"]);
    expect(stateChanges).toContainEqual(["idle", "max_duration"]);
    expect(recorder.state).toBe("idle");
  });

  it("AC4: onLevel fires ~every levelIntervalMs with 0..1 RMS, and stops firing after stop()", async () => {
    const harness = createHarness();
    const recorder = createVoiceRecorder({ levelIntervalMs: 33 }, harness.deps);
    const levels: number[] = [];
    recorder.onLevel((rms) => levels.push(rms));

    await recorder.start();
    feedFrames(harness, sineFrames(660, 16000, 0.5), 16000); // ~20 ticks

    for (const rms of levels) {
      expect(rms).toBeGreaterThanOrEqual(0);
      expect(rms).toBeLessThanOrEqual(1);
    }
    expect(levels.length).toBeGreaterThanOrEqual(18);
    expect(levels.length).toBeLessThanOrEqual(22);

    await recorder.stop("manual");
    const countAfterStop = levels.length;
    harness.clock.advance(500);
    expect(levels.length).toBe(countAfterStop);
  });

  it("AC5: classifies getUserMedia rejections by DOMException name", async () => {
    const cases: Array<[string, string]> = [
      ["NotAllowedError", "PERMISSION_DENIED"],
      ["NotFoundError", "NO_DEVICE"],
      ["NotReadableError", "DEVICE_BUSY"],
      ["AbortError", "UNKNOWN"],
    ];

    for (const [domErrorName, expectedCode] of cases) {
      const harness = createHarness({
        getUserMediaImpl: () => {
          const error = new Error(domErrorName);
          error.name = domErrorName;
          return Promise.reject(error);
        },
      });
      const recorder = createVoiceRecorder(undefined, harness.deps);

      await expect(recorder.start()).rejects.toMatchObject({ code: expectedCode });
      expect(recorder.state).toBe("error");
    }
  });

  it("AC5b: retrying the same recorder instance after an error works", async () => {
    let attempt = 0;
    const harness = createHarness({
      getUserMediaImpl: () => {
        attempt += 1;
        if (attempt === 1) {
          const error = new Error("NotAllowedError");
          error.name = "NotAllowedError";
          return Promise.reject(error);
        }
        return Promise.resolve(new FakeMediaStream());
      },
    });
    const recorder = createVoiceRecorder(undefined, harness.deps);

    await expect(recorder.start()).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(recorder.state).toBe("error");

    await recorder.start();
    expect(recorder.state).toBe("recording");
  });

  it("AC6: unsupported (insecure context) -> NOT_SUPPORTED without calling getUserMedia", async () => {
    Object.defineProperty(window, "isSecureContext", {
      value: false,
      configurable: true,
    });
    const harness = createHarness();
    const recorder = createVoiceRecorder(undefined, harness.deps);

    await expect(recorder.start()).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
    expect(harness.getUserMedia).not.toHaveBeenCalled();
    expect(recorder.state).toBe("error");
  });

  it("AC7: cancel returns null and releases resources exactly once (no leak)", async () => {
    const harness = createHarness();
    const recorder = createVoiceRecorder(undefined, harness.deps);

    await recorder.start();
    feedFrames(harness, sineFrames(500, 16000, 0.5), 16000);
    const node = currentWorkletNode();

    const result = await recorder.stop("cancel");

    expect(result).toBeNull();
    const track = harness.stream.getTracks()[0]!;
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(node.disconnect).toHaveBeenCalledTimes(1);
    expect(recorder.state).toBe("idle");
  });

  it("regression: audioContext.close() is called exactly once per stop, not left open", async () => {
    const harness = createHarness();
    const recorder = createVoiceRecorder(undefined, harness.deps);

    await recorder.start();
    const context = currentAudioContext();
    feedFrames(harness, sineFrames(500, 16000, 0.5), 16000);
    await recorder.stop("manual");

    expect(context.close).toHaveBeenCalledTimes(1);
    expect(recorder.state).toBe("idle");
  });

  it("rejects start() while already recording, but allows it again once idle", async () => {
    const harness = createHarness();
    const recorder = createVoiceRecorder(undefined, harness.deps);

    await recorder.start();
    await expect(recorder.start()).rejects.toThrow();

    await recorder.stop("cancel");
    await expect(recorder.start()).resolves.toBeUndefined();
  });
});
