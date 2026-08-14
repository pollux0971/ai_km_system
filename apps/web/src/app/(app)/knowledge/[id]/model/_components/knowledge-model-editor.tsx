"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { AI_MODELS, type AiModel } from "@/lib/ai-models";
import { getKnowledgeBase, updateKnowledgeBaseBoundModel } from "@/lib/knowledge-bases";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-model-editor");

const UNBOUND_VALUE = "";

type LoadState = { status: "loading" } | { status: "error" } | { status: "not-found" } | { status: "loaded" };

/**
 * E05-S009 "KB model binding UI". A dedicated route
 * (/knowledge/[id]/model), same "separate route per KB concern"
 * precedent S04/S06/S07/S08 already established.
 *
 * Single-select `<select>`, instant-apply on change — mirrors
 * ModelSelector (conversations/[id]/_components/model-selector.tsx,
 * E03-S005) almost exactly, including reusing AI_MODELS as the single
 * options source (so the visibly-disabled "cloud" option and its label
 * never drift from the conversation-side selector) and rejecting a
 * disabled model server-side too via
 * updateKnowledgeBaseBoundModel — not just relying on the `<option
 * disabled>` a bypassed client could ignore. This component still needs
 * its own initial fetch (loading/error/not-found), unlike
 * ModelSelector, which receives `initialModel` as a prop from an
 * already-loaded parent (ConversationDetail) — this is a standalone
 * route, not embedded in an existing detail page.
 *
 * Adds one thing ModelSelector doesn't need: an explicit "unbound"
 * option. A conversation always has a real, required model (there's
 * nothing to select back to), but a knowledge base's bound model is an
 * optional PREFERENCE — see `boundModel`'s own doc comment on
 * KnowledgeBaseSummary — so the select offers a way back to
 * "no override, defer to the conversation's own model", the same way
 * S006/S007's multi-selects can return to `[]`.
 *
 * Telemetry DOES include the actual from/to model values (unlike
 * S008's prompt text) — `AiModel` is a small fixed-vocabulary enum, not
 * free-form content, same reasoning S006/S007 already apply to
 * roles/members, and the same thing ModelSelector's own existing
 * telemetry already does for conversations. Functional AC 7 (audit
 * event) is judged N/A, same as S008 — binding a model is a
 * configuration change, not an access-control one.
 */
export default function KnowledgeModelEditor({ id }: { id: string }) {
  const selectId = useId();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [boundModel, setBoundModel] = useState<AiModel | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading knowledge base for model binding", { correlationId, id });

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

      logger.info("knowledge base loaded for model binding", { correlationId, id });
      setBoundModel(result.value.boundModel);
      setLoadState({ status: "loaded" });
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleChange(nextValue: string) {
    const nextModel = nextValue === UNBOUND_VALUE ? undefined : (nextValue as AiModel);
    if (nextModel === boundModel || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("updating knowledge base bound model", { correlationId, id, from: boundModel, to: nextModel });
    trackEvent("knowledge_base_model_attempt", {
      correlationId,
      properties: { knowledgeBaseId: id, from: boundModel ?? null, to: nextModel ?? null },
    });

    const result = await updateKnowledgeBaseBoundModel(id, nextModel);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to update knowledge base bound model", { correlationId, id, code: result.error.code });
      trackEvent("knowledge_base_model_failure", {
        correlationId,
        properties: { knowledgeBaseId: id, code: result.error.code },
      });
      setError(true);
      return;
    }

    logger.info("knowledge base bound model updated", { correlationId, id, model: result.value.boundModel });
    trackEvent("knowledge_base_model_success", {
      correlationId,
      properties: { knowledgeBaseId: id, model: result.value.boundModel ?? null },
    });
    setBoundModel(result.value.boundModel);
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
      <h1>知識庫模型綁定</h1>
      <label htmlFor={selectId}>綁定模型</label>
      <br />
      <select
        id={selectId}
        value={boundModel ?? UNBOUND_VALUE}
        disabled={pending}
        onChange={(event) => handleChange(event.target.value)}
      >
        <option value={UNBOUND_VALUE}>（未綁定，依對話設定）</option>
        {AI_MODELS.map((option) => (
          <option key={option.id} value={option.id} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>

      {pending && (
        <p role="status" style={{ marginTop: 8 }}>
          儲存中…
        </p>
      )}
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="更新模型綁定失敗，請稍後再試。" />
        </div>
      )}
      <p style={{ marginTop: 16 }}>
        <Link href={`/knowledge/${id}`}>返回知識庫詳情</Link>
      </p>
    </main>
  );
}
