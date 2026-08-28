/**
 * E03-S040 voice capture error taxonomy. `code` is the stable,
 * machine-readable field UI (E03-S041) branches on; `message` is
 * diagnostic only and must not be pattern-matched by callers.
 */
export type VoiceCaptureErrorCode =
  | "NOT_SUPPORTED"
  | "PERMISSION_DENIED"
  | "NO_DEVICE"
  | "DEVICE_BUSY"
  | "TOO_SHORT"
  | "UNKNOWN";

export class VoiceCaptureError extends Error {
  readonly code: VoiceCaptureErrorCode;

  constructor(code: VoiceCaptureErrorCode, message?: string) {
    super(message ?? code);
    this.name = "VoiceCaptureError";
    this.code = code;
  }
}

/** Maps a `getUserMedia` rejection to a {@link VoiceCaptureErrorCode}. */
export function classifyGetUserMediaError(error: unknown): VoiceCaptureError {
  const name = error instanceof Error ? error.name : undefined;
  switch (name) {
    case "NotAllowedError":
      return new VoiceCaptureError("PERMISSION_DENIED");
    case "NotFoundError":
      return new VoiceCaptureError("NO_DEVICE");
    case "NotReadableError":
      return new VoiceCaptureError("DEVICE_BUSY");
    default:
      return new VoiceCaptureError("UNKNOWN");
  }
}
