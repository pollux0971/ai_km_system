"use client";

import { useEffect } from "react";
import { CrashFallback } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";

const logger = createLogger("web:global-error-boundary");

/**
 * E01-S018: the outermost app-level error boundary — catches errors
 * thrown by the root layout itself (./layout.tsx), which error.tsx
 * cannot catch (Next.js requirement: when the root layout is what
 * crashed, the replacement boundary must supply its own <html>/<body>,
 * since the crashed layout can no longer provide them).
 *
 * Root layout here is static JSX with no data fetching or logic, so this
 * path is rare in practice — but the capability itself must not be
 * absent (Functional AC 8). Not exercised by an automated test: forcing
 * the root layout to throw on demand would mean adding test-only
 * conditional logic to a file that should stay minimal and stable
 * (see docs/stories/E01-S018.md Assumptions for the full reasoning).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error("unhandled root layout error", {
      correlationId: crypto.randomUUID(),
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <html lang="zh-Hant">
      <body>
        <div style={{ padding: 32 }}>
          <CrashFallback onRetry={reset} />
        </div>
      </body>
    </html>
  );
}
