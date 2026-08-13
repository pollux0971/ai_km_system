import { ErrorMessage } from "./error-message";

/**
 * E01-S018: what an app-level error boundary renders when a rendering
 * error escapes an entire route segment (apps/web's error.tsx and
 * global-error.tsx). Distinct from ErrorMessage's inline widget-level
 * presentation (E01-S012): this is a full takeover of the content area,
 * so it always pairs the message with a way forward — retry the segment
 * (when the caller can offer that) or navigate away — since the user has
 * no other path out of a crashed subtree. Reuses ErrorMessage's existing
 * SERVER_ERROR copy rather than inventing new wording.
 */
export function CrashFallback({ onRetry }: { onRetry?: () => void } = {}) {
  return (
    <div>
      <h1>發生未預期的錯誤</h1>
      {/* ErrorMessage already renders role="alert" — no need to duplicate it here. */}
      <ErrorMessage code="SERVER_ERROR" />
      {onRetry && (
        <button type="button" onClick={onRetry}>
          重試
        </button>
      )}{" "}
      <a href="/">回首頁</a>
    </div>
  );
}
