"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getKnowledgeBase, type KnowledgeBaseSummary } from "@/lib/knowledge-bases";
import { listKnowledgeBaseDocuments, type KnowledgeBaseDocument } from "@/lib/knowledge-documents";
import KnowledgeDocumentUpload from "./knowledge-document-upload";
import KnowledgeDocumentUrlImport from "./knowledge-document-url-import";
import { formatFileSize } from "./format-file-size";

const logger = createLogger("web:knowledge-document-list");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "loaded"; knowledgeBase: KnowledgeBaseSummary; documents: KnowledgeBaseDocument[] };

/**
 * E05-S010 "KB document list". A dedicated route
 * (/knowledge/[id]/documents), same "separate route per KB concern"
 * precedent S04/S06/S07/S08/S09 already established.
 *
 * E05-S011 "Single-file upload" adds KnowledgeDocumentUpload directly
 * on THIS page, not a separate `/knowledge/[id]/documents/upload`
 * route — unlike the KB-level settings pages (permissions/members/
 * prompt/model), each their own dedicated route off /knowledge/[id]/,
 * "documents" is a growing CHILD COLLECTION, and "add an item" belongs
 * on the same page as the list it adds to. Same relationship
 * lib/messages.ts's Message has to ConversationSummary: sendMessage()
 * is invoked from a composer embedded directly in
 * conversation-detail.tsx (/conversations/[id]) — there's no separate
 * `/conversations/[id]/messages/new` route — not the S03/S04-style
 * "separate route, one link out to it" relationship this page itself
 * has with knowledge-detail.tsx (a KB has exactly one edit form; a
 * document list can gain many items, each via the same in-place
 * action). refetchDocuments() re-fetches only the document list (not
 * knowledgeBase) after a successful upload, passed to
 * KnowledgeDocumentUpload as `onUploaded`.
 *
 * Two sequential fetches, not parallel: getKnowledgeBase(id) first, and
 * only once that resolves to a real knowledge base does it fetch
 * listKnowledgeBaseDocuments(id) — documents are meaningless without a
 * confirmed-existing parent, so there's no reason to ask for them
 * before the knowledge base itself is confirmed to exist. A dedicated
 * test verifies listKnowledgeBaseDocuments is never called when the
 * knowledge base fetch resolves not-found or error.
 *
 * E05-S014 "URL import" adds KnowledgeDocumentUrlImport alongside
 * KnowledgeDocumentUpload, same page, same `refetchDocuments` callback
 * (renamed conceptually to cover "the list changed" generally, not
 * just uploads — reused as-is since it was already upload-source
 * agnostic, just re-fetching the list). A URL-imported document has no
 * `sizeBytes` (see that field's own doc comment on
 * KnowledgeBaseDocument) — the size line only renders when the value
 * is present, rather than showing a misleading "0 B".
 *

 * One shared "error" status covers a failure from EITHER fetch — mock
 * listKnowledgeBaseDocuments() never actually returns `ok: false` (it's
 * an unconditional filter, same as listMessages/listKnowledgeBases), so
 * this is exercised only by a directly-mocked test, same as every
 * sibling editor's own always-technically-unreachable error branch;
 * splitting into two differently-worded error states for a branch this
 * hypothetical isn't worth the added complexity.
 *
 * No logger.info telemetry pair beyond the load itself (no `trackEvent`
 * attempt/success/failure calls) — same precedent as
 * knowledge-list.tsx/KnowledgeDetail: those are for a user-INITIATED
 * mutation attempt, and loading a read-only list is not one, exactly
 * the same reasoning KnowledgeList (S001) itself already established.
 */
export default function KnowledgeDocumentList({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading knowledge base for document list", { correlationId, id });

    getKnowledgeBase(id).then(async (kbResult) => {
      if (cancelled) return;

      if (!kbResult.ok) {
        logger.error("failed to load knowledge base", { correlationId, id, code: kbResult.error.code });
        setState({ status: "error" });
        return;
      }

      if (!kbResult.value) {
        logger.info("knowledge base not found", { correlationId, id });
        setState({ status: "not-found" });
        return;
      }

      const knowledgeBase = kbResult.value;
      const documentsResult = await listKnowledgeBaseDocuments(id);
      if (cancelled) return;

      if (!documentsResult.ok) {
        logger.error("failed to load document list", { correlationId, id, code: documentsResult.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("document list loaded", { correlationId, id, count: documentsResult.value.length });
      setState({ status: "loaded", knowledgeBase, documents: documentsResult.value });
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function refetchDocuments() {
    const correlationId = crypto.randomUUID();
    logger.info("refreshing document list", { correlationId, id });
    const documentsResult = await listKnowledgeBaseDocuments(id);

    if (!documentsResult.ok) {
      // Same "secondary fetch failure shouldn't discard an
      // otherwise-successful page" reasoning as knowledge-detail.tsx's
      // own documentCount fetch — the upload itself already succeeded
      // and the page is already showing a valid (if now slightly
      // stale) list; silently keep it rather than erroring the whole
      // page over a refresh that failed after the real work was done.
      logger.error("failed to refresh document list", { correlationId, id, code: documentsResult.error.code });
      return;
    }

    logger.info("document list refreshed", { correlationId, id, count: documentsResult.value.length });
    setState((prev) => (prev.status === "loaded" ? { ...prev, documents: documentsResult.value } : prev));
  }

  if (state.status === "loading") {
    return (
      <main style={{ padding: 32 }}>
        <LoadingIndicator />
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main style={{ padding: 32 }}>
        <ErrorMessage message="無法載入知識庫的文件列表。" />
      </main>
    );
  }

  if (state.status === "not-found") {
    return (
      <main style={{ padding: 32 }}>
        <ErrorMessage code="NOT_FOUND" />
      </main>
    );
  }

  const { knowledgeBase, documents } = state;

  return (
    <main style={{ padding: 32 }}>
      <h1>{knowledgeBase.name} — 文件列表</h1>

      <KnowledgeDocumentUpload knowledgeBaseId={id} onUploaded={refetchDocuments} />
      <KnowledgeDocumentUrlImport knowledgeBaseId={id} onImported={refetchDocuments} />

      {documents.length === 0 && <EmptyState message="這個知識庫尚無文件。" />}

      {documents.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {documents.map((document) => (
            <li key={document.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
              <strong>{document.name}</strong>
              <br />
              {document.sizeBytes !== undefined && (
                <>
                  <span>{formatFileSize(document.sizeBytes)}</span>
                  <br />
                </>
              )}
              <time dateTime={document.uploadedAt}>{new Date(document.uploadedAt).toLocaleString("zh-TW")}</time>
            </li>
          ))}
        </ul>
      )}

      <p style={{ marginTop: 16 }}>
        <Link href={`/knowledge/${id}`}>返回知識庫詳情</Link>
      </p>
    </main>
  );
}
