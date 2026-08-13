import { notFound } from "next/navigation";

/**
 * E01-S018 test-only fixture for the app-level error boundary
 * (../error.tsx). An error boundary, by definition, only exists to catch
 * UNPLANNED crashes — there is no real product page that's "supposed" to
 * crash, so a deliberate fixture is the only way to exercise the
 * boundary end-to-end (see tests/e2e/specs/error-boundary.spec.ts).
 *
 * Deliberately NOT named with a leading underscore (e.g. `_debug-throw`)
 * — that Next.js App Router convention marks a folder private and
 * excludes it from routing entirely (the same convention this codebase
 * already uses for _components/), which would make this fixture
 * unreachable at any URL and silently no-op instead of testing anything.
 *
 * Inert in a real production build (404s via notFound()) so it never
 * ships as a reachable route. `next dev` — what E2E always runs against,
 * see tests/e2e/playwright.config.ts — has NODE_ENV=development, so the
 * fixture stays reachable there.
 */
export default function DebugThrowPage(): never {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  throw new Error("E01-S018 deliberate test error for the error boundary");
}
