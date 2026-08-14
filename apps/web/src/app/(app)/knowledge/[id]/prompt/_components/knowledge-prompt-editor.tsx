"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getKnowledgeBase, updateKnowledgeBaseBoundPrompt } from "@/lib/knowledge-bases";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-prompt-editor");

type LoadState = { status: "loading" } | { status: "error" } | { status: "not-found" } | { status: "loaded" };

/**
 * E05-S008 "KB prompt binding UI". A dedicated route
 * (/knowledge/[id]/prompt), same "separate route per KB concern"
 * precedent S04/S06/S07 already established.
 *
 * Binds the prompt TEXT directly to the knowledge base — there is no
 * separate Prompt entity to reference yet (E11-S12 "Prompt Admin" and
 * E12 "Model & Prompt Platform" are both unbuilt); see `boundPrompt`'s
 * own doc comment on KnowledgeBaseSummary.
 *
 * Submit-based (a textarea + explicit 儲存 button), NOT the instant-apply
 * checkbox/list pattern S06/S07 use — this is free-form multi-line text
 * a user actively composes and revises, not a discrete toggle/add/remove
 * action, so saving on every keystroke would be both poor UX and an
 * excessive number of update calls. Stays on this page after a
 * successful save (doesn't redirect to /knowledge like /knowledge/new
 * or /knowledge/[id]/edit do) — same "stay on the dedicated sub-route"
 * precedent S06/S07 already established, and more useful here
 * specifically since a user iterating on prompt wording benefits from
 * staying put rather than re-navigating back in to keep editing. A
 * brief "已儲存。" status confirms success (there's no redirect to imply
 * it), cleared as soon as the draft changes again so it never lies
 * about the CURRENT (possibly since-edited) draft's save state.
 *
 * The prompt itself is free-form CONTENT, not a fixed-vocabulary role or
 * a short opaque identifier — closer to `description` than to
 * `visibleToRoles`/`members`, so — unlike S06/S07's telemetry, which
 * deliberately includes the actual role/member values — this component's
 * trackEvent calls never include the prompt text itself, same
 * "don't log enterprise content" restraint createKnowledgeBase/
 * updateKnowledgeBase already apply to `name`/`description`. Functional
 * AC 7 (audit event for sensitive operations) is therefore judged N/A
 * here, same as S003-S005's metadata edits — unlike S06/S07, editing a
 * KB's bound prompt text isn't an access-control change.
 *
 * Loading/error/not-found states on the initial fetch mirror
 * EditKnowledgeBase/KnowledgeDetail's own established pattern.
 */
export default function KnowledgePromptEditor({ id }: { id: string }) {
  const textareaId = useId();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading knowledge base for prompt editing", { correlationId, id });

    getKnowledgeBase(id).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load knowledge base", { correlationId, id, code: result.error.code });
        setLoadState({ status: "error" });
        return;
      }

      if (!result.value) {
        logger.info("knowledge base not found", { correlationId, id });
        setLoadState({ status: "not-found" });
        return;
      }

      logger.info("knowledge base loaded for prompt editing", { correlationId, id });
      setDraft(result.value.boundPrompt ?? "");
      setLoadState({ status: "loaded" });
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  function handleDraftChange(value: string) {
    setDraft(value);
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    setSaved(false);
    logger.info("updating knowledge base bound prompt", { correlationId, id });
    trackEvent("knowledge_base_prompt_attempt", { correlationId, properties: { knowledgeBaseId: id } });

    const result = await updateKnowledgeBaseBoundPrompt(id, draft);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to update knowledge base bound prompt", { correlationId, id, code: result.error.code });
      trackEvent("knowledge_base_prompt_failure", {
        correlationId,
        properties: { knowledgeBaseId: id, code: result.error.code },
      });
      setError(true);
      return;
    }

    logger.info("knowledge base bound prompt updated", { correlationId, id });
    trackEvent("knowledge_base_prompt_success", { correlationId, properties: { knowledgeBaseId: id } });
    setDraft(result.value.boundPrompt ?? "");
    setSaved(true);
  }

  if (loadState.status === "loading") {
    return (
      <main style={{ padding: 32 }}>
        <LoadingIndicator />
      </main>
    );
  }

  if (loadState.status === "error") {
    return (
      <main style={{ padding: 32 }}>
        <ErrorMessage message="無法載入知識庫。" />
      </main>
    );
  }

  if (loadState.status === "not-found") {
    return (
      <main style={{ padding: 32 }}>
        <ErrorMessage code="NOT_FOUND" />
      </main>
    );
  }

  return (
    <main style={{ padding: 32 }}>
      <h1>知識庫提示詞設定</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor={textareaId}>綁定提示詞(選填)</label>
        <br />
        <textarea
          id={textareaId}
          value={draft}
          onChange={(event) => handleDraftChange(event.target.value)}
          disabled={pending}
          rows={8}
          style={{ width: "100%", maxWidth: 480 }}
        />
        <br />
        <button type="submit" disabled={pending}>
          儲存
        </button>
      </form>

      {saved && (
        <p role="status" style={{ marginTop: 8 }}>
          已儲存。
        </p>
      )}
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="更新提示詞失敗，請稍後再試。" />
        </div>
      )}
      <p style={{ marginTop: 16 }}>
        <Link href={`/knowledge/${id}`}>返回知識庫詳情</Link>
      </p>
    </main>
  );
}
