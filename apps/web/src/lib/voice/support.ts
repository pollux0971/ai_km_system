/**
 * Environment capability check: secure context + `getUserMedia` +
 * `AudioWorkletNode`. Used both by callers (to gate showing the mic UI)
 * and internally by {@link createVoiceRecorder} to fail fast with
 * `NOT_SUPPORTED` before touching `getUserMedia`.
 */
export function isVoiceCaptureSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.isSecureContext &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      "AudioWorkletNode" in window,
  );
}
