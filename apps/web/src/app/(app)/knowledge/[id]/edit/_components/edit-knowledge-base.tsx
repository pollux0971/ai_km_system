"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getKnowledgeBase, updateKnowledgeBase } from "@/lib/knowledge-bases";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-edit");

type LoadState = { status: "loading" } | { status: "error" } | { status: "not-found" } | { status: "loaded" };

/**
 * E05-S004 "Edit KB metadata". Unlike RenameConversation (an edit widget
 * embedded within the already-existing /conversations/[id] detail page),
 * this is its own standalone route — /knowledge/[id] (E05-S05 "KB Detail
 * page") doesn't exist yet, so there's no richer detail page to embed an
 * edit control into. The list page (KnowledgeList) is where this story
 * adds the "編輯" entry link, each pointing at
 * /knowledge/{id}/edit — a distinct, explicitly-labeled edit action, NOT
 * the whole-item-to-detail-view link E05-S001 deliberately left out
 * (that link still doesn't exist; this is a different route entirely).
 *
 * Loading/error/not-found/loaded states on initial fetch mirror
 * ConversationDetail's own pattern exactly, including reusing
 * ErrorMessage's shared NOT_FOUND code rather than inventing new copy —
 * "not found" here means a valid route whose `id` just doesn't resolve
 * to anything (e.g. a stale bookmarked link), a genuinely different
 * outcome from a dependency/fetch failure.
 *
 * Deliberately NOT a shared component with /knowledge/new's form despite
 * the overlapping name+description fields — same precedent as
 * RenameConversation staying independent from conversations/new/page.tsx
 * despite both being "a text input + submit": the two forms differ in
 * real, non-cosmetic ways (this one needs an initial fetch + pre-fill +
 * not-found handling that create doesn't), and this codebase has no
 * precedent of sharing form components between its create and edit
 * flows.
 *
 * Redirects to /knowledge (the list) on success, same as /knowledge/new
 * — not to /knowledge/[id], which still doesn't exist, and unlike
 * RenameConversation there is no richer "stay on this page" detail view
 * for a saved result to remain visible in.
 */
export default function EditKnowledgeBase({ id }: { id: string }) {
  const router = useRouter();
  const nameId = useId();
  const descriptionId = useId();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading knowledge base for edit", { correlationId, id });

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

      logger.info("knowledge base loaded for edit", { correlationId, id });
      setName(result.value.name);
      setDescription(result.value.description);
      setLoadState({ status: "loaded" });
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setSubmitError(false);
    logger.info("updating knowledge base", { correlationId, id });
    trackEvent("knowledge_base_update_attempt", { correlationId, properties: { knowledgeBaseId: id } });

    const result = await updateKnowledgeBase(id, trimmedName, description);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to update knowledge base", { correlationId, id, code: result.error.code });
      trackEvent("knowledge_base_update_failure", {
        correlationId,
        properties: { knowledgeBaseId: id, code: result.error.code },
      });
      setSubmitError(true);
      return;
    }

    logger.info("knowledge base updated", { correlationId, id });
    trackEvent("knowledge_base_update_success", { correlationId, properties: { knowledgeBaseId: id } });
    router.refresh();
    router.replace("/knowledge");
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
      <h1>編輯知識庫</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={nameId}>知識庫名稱</label>
          <br />
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={pending}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={descriptionId}>說明</label>
          <br />
          <textarea
            id={descriptionId}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={pending}
          />
        </div>
        <button type="submit" disabled={pending || name.trim().length === 0}>
          儲存
        </button>{" "}
        <Link href="/knowledge">取消</Link>
      </form>
      {submitError && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="無法儲存知識庫，請稍後再試。" />
        </div>
      )}
    </main>
  );
}
