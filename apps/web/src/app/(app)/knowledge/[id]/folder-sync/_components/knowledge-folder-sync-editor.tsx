"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getKnowledgeBase, updateKnowledgeBaseFolderSync } from "@/lib/knowledge-bases";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-folder-sync-editor");

type LoadState = { status: "loading" } | { status: "error" } | { status: "not-found" } | { status: "loaded" };

/**
 * E05-S016 "Folder sync setup UI". A dedicated route
 * (/knowledge/[id]/folder-sync), same "separate route per KB concern"
 * precedent S04/S06/S07/S08/S09 already established — this is a
 * KB-level CONFIGURATION (like the roles/members/prompt/model
 * bindings), not a document-adding action, so it belongs alongside
 * those dedicated settings routes rather than embedded on the
 * documents page the way S011-S015's upload/import/text-input widgets
 * are (those add DOCUMENTS; this configures a standing KB-level
 * setting, the same category as S006's role checkboxes or S009's model
 * dropdown).
 *
 * Submit-based (path input + checkbox + explicit 儲存 button), not
 * instant-apply — combines a text field with a checkbox, same "text
 * entry deserves a chance to review before committing" reasoning S008's
 * prompt editor and this route's own siblings already establish;
 * unlike S006/S007's pure checkbox-group instant-apply (nothing to
 * "review", just toggling among already-safe options).
 *
 * Enabling sync without a path is rejected with a SPECIFIC message
 * (shown directly via `result.error.message`, not a generic string) —
 * same reasoning KnowledgeDocumentUrlImport/KnowledgeDocumentTextInput
 * (S014/S015) already give: this codebase's own deliberately-authored
 * validation messages are safe to show directly, and this failure mode
 * is the expected, routine way a user discovers they need to fill in
 * the path first. Disabling sync is always allowed regardless of the
 * path, so only the checkbox's own state (not the path's presence)
 * gates whether the path is required — the 儲存 button itself is
 * never disabled; the validation lives server-side (mock-layer) same
 * as every sibling editor's own discipline of not trusting the UI
 * guard alone.
 *
 * On success, stays on this page (like S06-S09, not S03/S04's
 * redirect-to-list) and shows a transient "已儲存。" status, cleared
 * as soon as either field changes again — same pattern S008's prompt
 * editor already established, so the confirmation never lies about the
 * (possibly since-edited) current draft's save state.
 *
 * Telemetry excludes the path (a filesystem/cloud location, free-form
 * and potentially revealing internal infrastructure layout — same
 * "don't log free-form user content" restraint as S008/S011/S014/S015)
 * but includes `enabled` (a plain boolean, safe to log like every
 * other categorical value this route's siblings already record).
 *
 * This is a SETTING ONLY — see `folderSyncPath`'s own doc comment on
 * KnowledgeBaseSummary for why no real sync job ever runs as a result
 * of anything this component does.
 */
export default function KnowledgeFolderSyncEditor({ id }: { id: string }) {
  const pathId = useId();
  const enabledId = useId();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [path, setPath] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading knowledge base for folder sync setup", { correlationId, id });

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

      logger.info("knowledge base loaded for folder sync setup", { correlationId, id });
      setPath(result.value.folderSyncPath ?? "");
      setEnabled(result.value.folderSyncEnabled ?? false);
      setLoadState({ status: "loaded" });
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  function handlePathChange(value: string) {
    setPath(value);
    setError(null);
    setSaved(false);
  }

  function handleEnabledChange(value: boolean) {
    setEnabled(value);
    setError(null);
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(null);
    setSaved(false);
    logger.info("updating knowledge base folder sync", { correlationId, id, enabled });
    trackEvent("knowledge_base_folder_sync_attempt", { correlationId, properties: { knowledgeBaseId: id, enabled } });

    const result = await updateKnowledgeBaseFolderSync(id, path, enabled);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to update knowledge base folder sync", { correlationId, id, code: result.error.code });
      trackEvent("knowledge_base_folder_sync_failure", {
        correlationId,
        properties: { knowledgeBaseId: id, code: result.error.code },
      });
      setError(result.error.message);
      return;
    }

    logger.info("knowledge base folder sync updated", { correlationId, id, enabled: result.value.folderSyncEnabled });
    trackEvent("knowledge_base_folder_sync_success", {
      correlationId,
      properties: { knowledgeBaseId: id, enabled: result.value.folderSyncEnabled ?? false },
    });
    setPath(result.value.folderSyncPath ?? "");
    setEnabled(result.value.folderSyncEnabled ?? false);
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
      <h1>資料夾同步設定</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor={pathId}>資料夾路徑</label>
        <br />
        <input
          id={pathId}
          type="text"
          value={path}
          onChange={(event) => handlePathChange(event.target.value)}
          disabled={pending}
          placeholder="/mnt/shared/policies"
          style={{ width: "100%", maxWidth: 480 }}
        />
        <br />
        <label htmlFor={enabledId}>
          <input
            id={enabledId}
            type="checkbox"
            checked={enabled}
            onChange={(event) => handleEnabledChange(event.target.checked)}
            disabled={pending}
          />
          啟用資料夾同步
        </label>
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
          <ErrorMessage message={error} />
        </div>
      )}
      <p style={{ marginTop: 16 }}>
        <Link href={`/knowledge/${id}`}>返回知識庫詳情</Link>
      </p>
    </main>
  );
}
