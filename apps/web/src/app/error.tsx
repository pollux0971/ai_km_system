"use client";

import { useEffect } from "react";
import { CrashFallback } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";

const logger = createLogger("web:error-boundary");

/**
 * E01-S018 app-level error boundary. Next.js file-convention boundary:
 * catches any rendering error thrown below the root layout — both the
 * (public) and (app) route groups, since neither defines its own
 * error.tsx — and renders inside the root layout's <html>/<body>. Must
 * be a Client Component (Next.js requirement for error.tsx).
 *
 * This alone doesn't cover a crash in the root layout itself, since the
 * root layout is what would normally render the <html>/<body> this
 * renders into — see global-error.tsx for that outermost case.
 */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error("unhandled rendering error", {
      correlationId: crypto.randomUUID(),
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <div style={{ padding: 32 }}>
      <CrashFallback onRetry={reset} />
    </div>
  );
}
