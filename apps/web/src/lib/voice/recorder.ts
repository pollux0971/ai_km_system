import { VoiceCaptureError, classifyGetUserMediaError } from "./errors";
import { resampleLinear } from "./resample";
import { isVoiceCaptureSupported } from "./support";
import type {
  VoiceAudioContextLike,
  VoiceAudioWorkletNodeLike,
  VoiceCapture,
  VoiceRecorder,
  VoiceRecorderDeps,
  VoiceRecorderOptions,
  VoiceRecorderState,
  VoiceStopReason,
} from "./types";
import { encodeWav } from "./wav";

const WORKLET_URL = "/worklets/pcm-recorder.worklet.js";
const WORKLET_NAME = "pcm-recorder";

const DEFAULT_OPTIONS: Required<VoiceRecorderOptions> = {
  maxDurationMs: 60000,
  silenceMs: 1200,
  silenceThreshold: 0.015,
  minSpeechMs: 300,
  levelIntervalMs: 33,
};

function defaultDeps(): VoiceRecorderDeps {
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    // Real browser globals structurally satisfy the minimal *Like
    // interfaces above; the cast only narrows the type surface for
    // testability, it does not change runtime behavior.
    AudioContext: window.AudioContext as unknown as VoiceRecorderDeps["AudioContext"],
    AudioWorkletNode:
      window.AudioWorkletNode as unknown as VoiceRecorderDeps["AudioWorkletNode"],
    now: () => performance.now(),
    setInterval: (handler, intervalMs) =>
      window.setInterval(handler, intervalMs) as unknown as number,
    clearInterval: (handle) => window.clearInterval(handle),
  };
}

function computeRms(chunks: Float32Array[]): number {
  let sumSquares = 0;
  let count = 0;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i += 1) {
      const sample = chunk[i] ?? 0;
      sumSquares += sample * sample;
      count += 1;
    }
  }
  return count === 0 ? 0 : Math.sqrt(sumSquares / count);
}

function concatFloat32(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

/**
 * Creates a UI-agnostic voice recording state machine: mic capture via an
 * AudioWorklet, live RMS level, silence/max-duration auto-stop, and a
 * 16kHz mono PCM16 WAV result. See E03-S040 spec for full behavior;
 * `options`/`deps` defaults make `createVoiceRecorder()` usable as-is in a
 * browser, `deps` overrides are for jsdom unit tests.
 */
export function createVoiceRecorder(
  options: VoiceRecorderOptions = {},
  deps: Partial<VoiceRecorderDeps> = {},
): VoiceRecorder {
  const resolvedOptions: Required<VoiceRecorderOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const resolvedDeps: VoiceRecorderDeps = { ...defaultDeps(), ...deps };

  let state: VoiceRecorderState = "idle";
  let levelCallback: ((rms: number) => void) | null = null;
  let stateChangeCallback:
    | ((state: VoiceRecorderState, reason?: VoiceStopReason) => void)
    | null = null;
  let autoStopCallback:
    | ((capture: VoiceCapture | null, reason: "silence" | "max_duration") => void)
    | null = null;

  let stream: MediaStream | null = null;
  let audioContext: VoiceAudioContextLike | null = null;
  let workletNode: VoiceAudioWorkletNodeLike | null = null;
  let intervalHandle: number | null = null;

  let recordedChunks: Float32Array[] = [];
  let pendingChunks: Float32Array[] = [];
  let nativeSampleRate = 16000;
  let startedAtMs = 0;
  let speechAccumulatedMs = 0;
  let silenceAccumulatedMs = 0;
  let hasEnoughSpeech = false;
  let peakRms = 0;

  function setState(next: VoiceRecorderState, reason?: VoiceStopReason): void {
    state = next;
    stateChangeCallback?.(next, reason);
  }

  function handleFrame(samples: Float32Array): void {
    if (state !== "recording") return;
    recordedChunks.push(samples);
    pendingChunks.push(samples);
  }

  function triggerAutoStop(reason: "silence" | "max_duration"): void {
    // Fire-and-forget: nothing awaits an internally-triggered stop() call
    // itself (start()'s caller already returned long ago). The resulting
    // VoiceCapture used to be discarded here entirely — E03-S041 needs it
    // (auto-stop -> auto-transcribe), so it's now handed to onAutoStop
    // instead. The only rejection stop() can produce here is TOO_SHORT
    // (max_duration reached with no speech ever detected); that maps to
    // `null`, the same "nothing usable" value a manual TOO_SHORT/cancel
    // caller already gets.
    void stop(reason)
      .then((capture) => autoStopCallback?.(capture, reason))
      .catch(() => autoStopCallback?.(null, reason));
  }

  function onIntervalTick(): void {
    if (state !== "recording") return;

    const rms = computeRms(pendingChunks);
    pendingChunks = [];
    peakRms = Math.max(peakRms, rms);
    levelCallback?.(rms);

    const elapsedSinceStart = resolvedDeps.now() - startedAtMs;
    if (elapsedSinceStart >= resolvedOptions.maxDurationMs) {
      triggerAutoStop("max_duration");
      return;
    }

    if (rms > resolvedOptions.silenceThreshold) {
      speechAccumulatedMs += resolvedOptions.levelIntervalMs;
      silenceAccumulatedMs = 0;
      if (speechAccumulatedMs >= resolvedOptions.minSpeechMs) {
        hasEnoughSpeech = true;
      }
    } else if (hasEnoughSpeech) {
      silenceAccumulatedMs += resolvedOptions.levelIntervalMs;
      if (silenceAccumulatedMs >= resolvedOptions.silenceMs) {
        triggerAutoStop("silence");
      }
    }
  }

  async function releaseResources(): Promise<void> {
    if (intervalHandle !== null) {
      resolvedDeps.clearInterval(intervalHandle);
      intervalHandle = null;
    }
    if (workletNode) {
      workletNode.port.onmessage = null;
      workletNode.disconnect();
      workletNode = null;
    }
    for (const track of stream?.getTracks() ?? []) {
      track.stop();
    }
    stream = null;
    if (audioContext) {
      await audioContext.close();
      audioContext = null;
    }
  }

  async function start(): Promise<void> {
    if (state !== "idle" && state !== "error") {
      throw new Error(`voice recorder cannot start() while ${state}`);
    }

    if (!isVoiceCaptureSupported()) {
      setState("error");
      throw new VoiceCaptureError("NOT_SUPPORTED");
    }

    setState("requesting");
    recordedChunks = [];
    pendingChunks = [];
    speechAccumulatedMs = 0;
    silenceAccumulatedMs = 0;
    hasEnoughSpeech = false;
    peakRms = 0;

    try {
      stream = await resolvedDeps.getUserMedia({ audio: true });
    } catch (error) {
      setState("error");
      throw classifyGetUserMediaError(error);
    }

    try {
      audioContext = new resolvedDeps.AudioContext({ sampleRate: 16000 });
      nativeSampleRate = audioContext.sampleRate;
      await audioContext.audioWorklet.addModule(WORKLET_URL);
      workletNode = new resolvedDeps.AudioWorkletNode(audioContext, WORKLET_NAME);
      workletNode.port.onmessage = (event: MessageEvent<{ samples: Float32Array }>) => {
        handleFrame(event.data.samples);
      };
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(workletNode);
    } catch (error) {
      await releaseResources();
      setState("error");
      throw new VoiceCaptureError(
        "UNKNOWN",
        error instanceof Error ? error.message : undefined,
      );
    }

    startedAtMs = resolvedDeps.now();
    intervalHandle = resolvedDeps.setInterval(onIntervalTick, resolvedOptions.levelIntervalMs);
    setState("recording");
  }

  async function stop(reason: VoiceStopReason): Promise<VoiceCapture | null> {
    if (state !== "recording") {
      throw new Error(`voice recorder cannot stop() while ${state}`);
    }

    setState("finalizing", reason);
    const chunks = recordedChunks;
    recordedChunks = [];
    await releaseResources();

    if (reason === "cancel") {
      setState("idle", reason);
      return null;
    }

    if (!hasEnoughSpeech) {
      setState("idle", reason);
      throw new VoiceCaptureError("TOO_SHORT");
    }

    const resampled = resampleLinear(concatFloat32(chunks), nativeSampleRate, 16000);
    const wav = encodeWav(resampled, 16000);
    const durationMs = (resampled.length / 16000) * 1000;

    setState("idle", reason);
    return { wav, durationMs, peakRms, sampleRate: 16000 };
  }

  return {
    start,
    stop,
    onLevel(callback) {
      levelCallback = callback;
    },
    onStateChange(callback) {
      stateChangeCallback = callback;
    },
    onAutoStop(callback) {
      autoStopCallback = callback;
    },
    get state() {
      return state;
    },
  };
}
