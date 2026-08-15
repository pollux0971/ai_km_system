import type { DiagnosticStep } from "@/lib/diagnostic-steps";

/**
 * E07-S007 "Current-step card". Pure presentational — no hooks, no
 * fetch of its own (maintenance-session.tsx already holds the loaded
 * session and derives `step` via getCurrentDiagnosticStep()), so no
 * "use client" directive is needed here: it carries no client-only
 * behavior of its own, same as ErrorMessage/EmptyState in @ai-km/ui.
 *
 * `stepIndex` is 0-based (see diagnostic-steps.ts's own doc comment);
 * the heading displays it 1-indexed ("步驟 1") since that's the natural
 * human-facing count, not the internal representation.
 */
export default function CurrentStepCard({ step }: { step: DiagnosticStep }) {
  return (
    <section>
      <h2>步驟 {step.stepIndex + 1}</h2>
      <p>{step.instruction}</p>
    </section>
  );
}
