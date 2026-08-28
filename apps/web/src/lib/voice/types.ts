export type VoiceRecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "finalizing"
  | "error";

export type VoiceStopReason = "manual" | "silence" | "max_duration" | "cancel";

export interface VoiceRecorderOptions {
  maxDurationMs?: number;
  silenceMs?: number;
  silenceThreshold?: number;
  minSpeechMs?: number;
  levelIntervalMs?: number;
}

export interface VoiceCapture {
  wav: Blob;
  durationMs: number;
  peakRms: number;
  sampleRate: 16000;
}

/** Minimal structural slice of `AudioNode` this lib depends on. */
export interface VoiceAudioNodeLike {
  connect(destination: VoiceAudioNodeLike): void;
}

/** Minimal structural slice of `AudioWorkletNode` this lib depends on. */
export interface VoiceAudioWorkletNodeLike extends VoiceAudioNodeLike {
  readonly port: {
    onmessage: ((event: MessageEvent) => void) | null;
  };
  disconnect(): void;
}

/** Minimal structural slice of `AudioContext` this lib depends on. */
export interface VoiceAudioContextLike {
  readonly sampleRate: number;
  readonly audioWorklet: { addModule(moduleUrl: string): Promise<void> };
  createMediaStreamSource(stream: MediaStream): VoiceAudioNodeLike;
  close(): Promise<void>;
}

/**
 * Injectable collaborators. Production defaults (see `recorder.ts`) wrap
 * the real browser globals; jsdom unit tests supply deterministic fakes
 * (fake clock + fake worklet graph) so the state machine, VAD and
 * resampling logic run without a real audio device.
 */
export interface VoiceRecorderDeps {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  AudioContext: new (options?: { sampleRate?: number }) => VoiceAudioContextLike;
  AudioWorkletNode: new (
    context: VoiceAudioContextLike,
    processorName: string,
  ) => VoiceAudioWorkletNodeLike;
  now: () => number;
  setInterval: (handler: () => void, intervalMs: number) => number;
  clearInterval: (handle: number) => void;
}

export interface VoiceRecorder {
  start(): Promise<void>;
  stop(reason: VoiceStopReason): Promise<VoiceCapture | null>;
  onLevel(callback: (rms: number) => void): void;
  /**
   * `reason` is populated when the state transition was caused by `stop()`
   * (manual or automatic); it is `undefined` for the idle→requesting→
   * recording transitions.
   */
  onStateChange(
    callback: (state: VoiceRecorderState, reason?: VoiceStopReason) => void,
  ): void;
  /**
   * E03-S041 addition: internal silence/max-duration auto-stop used to
   * discard its own `VoiceCapture` (fire-and-forget) — no AC of this
   * story required a caller to receive it, only that the transition
   * happen with the right `reason` (observable via `onStateChange`).
   * `onAutoStop` hands that previously-discarded result to a caller that
   * needs it (e.g. auto-transcribe-and-submit). `capture` is `null` for
   * the same reasons a manual `stop()` can resolve `null`/reject
   * (TOO_SHORT). Not registering a callback is the pre-E03-S041 behavior
   * exactly (result silently discarded) — same "no-op until you opt in"
   * shape as `onLevel`/`onStateChange`.
   */
  onAutoStop(
    callback: (capture: VoiceCapture | null, reason: "silence" | "max_duration") => void,
  ): void;
  readonly state: VoiceRecorderState;
}
