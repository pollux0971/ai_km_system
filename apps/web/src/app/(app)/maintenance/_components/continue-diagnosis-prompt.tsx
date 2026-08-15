"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { listMaintenanceCases, type MaintenanceCaseSummary } from "@/lib/maintenance-cases";
import { getDiagnosticSessionForCase } from "@/lib/diagnostic-sessions";

const logger = createLogger("web:continue-diagnosis-prompt");

/** Chinese labels for exactly the 2 non-terminal statuses this prompt ever shows — a narrower subset of the 5-value SESSION_STATUS_LABELS every other file in this domain already duplicates, not a 4th full copy of a Record most of whose entries could never appear here. */
const ACTIVE_STATUS_LABELS = {
  OPEN: "待處理",
  IN_PROGRESS: "進行中",
} as const;

/**
 * E07-S024 "Session-resume UX". Resuming an in-progress session already
 * works today — maintenance-session.tsx's own mount effect resumes an
 * existing DiagnosticSession rather than creating a second one (E07-S006)
 * — but nothing on the home page ever told a returning user THAT one
 * exists, or linked them straight back into it. `MaintenanceCaseList`
 * (E07-S001) itself deliberately still renders every item as plain text,
 * not a link — that constraint stands (see its own doc comment,
 * reaffirmed by E07-S021's own doc comment for why retrofitting it isn't
 * being done here either) so this is a wholly separate, brand-new
 * component instead: zero risk of colliding with either
 * `MaintenanceCaseList`'s or `MaintenanceHistoryList`'s own existing,
 * approved "renders no links" tests, since neither file is touched at
 * all.
 *
 * Composes the same two already-approved reads MaintenanceHistoryList
 * itself already combines — listMaintenanceCases (S001) +
 * getDiagnosticSessionForCase (S006) — filtered down to only OPEN/
 * IN_PROGRESS cases (the two states genuinely worth "resuming"; RESOLVED/
 * ESCALATED/CANCELLED are already-settled outcomes, and a case with no
 * session yet was never started, so there's nothing to resume). Shows
 * ALL matching cases, not just the single most-recent one — a
 * maintenance engineer can plausibly have more than one diagnosis open
 * at once, and arbitrarily hiding the rest would hide genuinely
 * resumable work, not just declutter.
 *
 * Deliberately renders NOTHING (no heading, no loading spinner, no error
 * message) unless there's at least one real match — this is a
 * supplementary prompt layered on top of an already-complete home page
 * (MaintenanceCaseList's own list still works regardless), not primary
 * content the page can't function without. A fetch failure at either
 * step degrades the same way an empty result would: log it, render
 * nothing, same "secondary feature, not primary content" reasoning
 * knowledge-candidates.ts's own maintenance-session.tsx integration
 * doc comment already gives for its own candidate-fetch failure (E07-
 * S023) — no `role="alert"` for a feature whose entire purpose is a
 * convenience shortcut to something still reachable another way (direct
 * URL, or Case Detail's own 查看診斷內容 link once E07-S021 exists for
 * that specific case).
 *
 * Rendered above MaintenanceCaseList on the home page — "continue what
 * you already started" is higher-priority than "browse everything" when
 * there's active work to return to. Each link's text is prefixed with
 * "繼續診斷:" rather than the bare case title alone — not just a UX
 * nicety, a structural necessity: MaintenanceCaseList's own existing,
 * already-approved E2E tests (E07-S002, E07-S005) assert a case's title
 * is visible via a plain, non-exact `getByText`, which was genuinely
 * unambiguous when written but stops being so the moment this component
 * legitimately shows the SAME title again for the SAME just-created case
 * (every case-creation flow lands on its own fresh session at OPEN,
 * which this component always surfaces immediately on return to the
 * list). The prefix keeps this link's own full text ("繼續診斷:空壓機
 * A") genuinely distinct from MaintenanceCaseList's own bare `<strong>`
 * text ("空壓機 A"), which is what lets those two tests disambiguate via
 * `{ exact: true }` — same narrow, already-established "later capability
 * creates a text-substring collision" fix class E07-S004/E07-S008/
 * E07-S018 each already used, not a loosening of what either test
 * asserts.
 */
export default function ContinueDiagnosisPrompt() {
  const [cases, setCases] = useState<(MaintenanceCaseSummary & { statusLabel: string })[]>([]);

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("checking for in-progress diagnostic sessions to resume", { correlationId });

    listMaintenanceCases().then(async (casesResult) => {
      if (cancelled) return;

      if (!casesResult.ok) {
        logger.error("failed to load maintenance case list", { correlationId, code: casesResult.error.code });
        return;
      }

      const allCases = casesResult.value;
      const sessionResults = await Promise.all(allCases.map((item) => getDiagnosticSessionForCase(item.id)));
      if (cancelled) return;

      const active: (MaintenanceCaseSummary & { statusLabel: string })[] = [];
      for (let i = 0; i < allCases.length; i++) {
        const maintenanceCase = allCases[i];
        const sessionResult = sessionResults[i];
        if (!maintenanceCase || !sessionResult) continue;

        if (!sessionResult.ok) {
          logger.error("failed to load a diagnostic session while checking for resumable ones", {
            correlationId,
            id: maintenanceCase.id,
            code: sessionResult.error.code,
          });
          continue;
        }

        const status = sessionResult.value?.status;
        if (status === "OPEN" || status === "IN_PROGRESS") {
          active.push({ ...maintenanceCase, statusLabel: ACTIVE_STATUS_LABELS[status] });
        }
      }

      logger.info("resumable diagnostic sessions found", { correlationId, count: active.length });
      setCases(active);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (cases.length === 0) return null;

  return (
    <section>
      <h2>繼續進行中的診斷</h2>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {cases.map((item) => (
          <li key={item.id}>
            <Link href={`/maintenance/${item.id}/session`}>繼續診斷:{item.title}</Link> — <span>{item.statusLabel}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
