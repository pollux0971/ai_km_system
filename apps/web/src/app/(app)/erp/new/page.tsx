"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { submitErpQuery } from "@/lib/erp-queries";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:erp-new");

/**
 * E09-S002 "Natural-language query composer" — the first interactive
 * step of asking a new ERP question, same relationship
 * maintenance/new/page.tsx (E07-S002) has with maintenance/page.tsx
 * (E07-S001): /erp deliberately left out an entry point to this route;
 * this story is exactly what adds it (see erp/page.tsx's own updated
 * doc comment).
 *
 * Single free-text question, not a multi-field form like
 * NewMaintenanceCasePage — E09's own story sequence (S003 scenario
 * selector, S004 clarification UI, S005 confirmation UI, S006 loading
 * state...) grows what happens AFTER submission across its own
 * dedicated stories, not additional input fields on this composer.
 *
 * Submit is disabled until the question is non-whitespace — same
 * "defense in depth, not the only guard" precedent as
 * NewMaintenanceCasePage: submitErpQuery() also fails closed with
 * VALIDATION_ERROR server-side for an empty/whitespace-only question.
 *
 * Redirects to the new query's own page (/erp/[id]) on success — same
 * "land directly inside the new item" precedent
 * NewMaintenanceCasePage's own doc comment establishes for
 * conversations/new, not knowledge/new's "redirect to list" one. Stays
 * put (not reset) on failure, so the user doesn't have to retype.
 *
 * Functional AC 7 (audit event) is judged N/A — same reasoning
 * NewMaintenanceCasePage's own doc comment gives: submitting a question
 * is a content-creation action, not an access-control change.
 * Telemetry deliberately excludes the question text itself — free-form
 * user-authored content, same restraint NewMaintenanceCasePage's own
 * problemDescription field already establishes.
 */
export default function NewErpQueryPage() {
  const router = useRouter();
  const questionId = useId();
  const [questionText, setQuestionText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!questionText.trim() || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("submitting ERP query", { correlationId });
    trackEvent("erp_query_create_attempt", { correlationId });

    const result = await submitErpQuery(questionText);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to submit ERP query", { correlationId, code: result.error.code });
      trackEvent("erp_query_create_failure", { correlationId, properties: { code: result.error.code } });
      setError(true);
      return;
    }

    logger.info("ERP query submitted", { correlationId, erpQueryId: result.value.id });
    trackEvent("erp_query_create_success", { correlationId, properties: { erpQueryId: result.value.id } });
    router.refresh();
    router.replace(`/erp/${result.value.id}`);
  }

  return (
    <main style={{ padding: 32 }}>
      <h1>新增 ERP 查詢</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={questionId}>輸入您的問題</label>
          <br />
          <textarea
            id={questionId}
            value={questionText}
            onChange={(event) => setQuestionText(event.target.value)}
            disabled={pending}
            rows={4}
            style={{ width: "100%", maxWidth: 480 }}
          />
        </div>
        <button type="submit" disabled={pending || !questionText.trim()}>
          送出查詢
        </button>{" "}
        <Link href="/erp">取消</Link>
      </form>
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="無法送出查詢，請稍後再試。" />
        </div>
      )}
    </main>
  );
}
