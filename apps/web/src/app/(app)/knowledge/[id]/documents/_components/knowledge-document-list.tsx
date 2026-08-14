"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getKnowledgeBase, type KnowledgeBaseSummary } from "@/lib/knowledge-bases";
import { listKnowledgeBaseDocuments, type KnowledgeBaseDocument } from "@/lib/knowledge-documents";

const logger = createLogger("web:knowledge-document-list");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "loaded"; knowledgeBase: KnowledgeBaseSummary; documents: KnowledgeBaseDocument[] };

/**
 * E05-S010 "KB document list". A dedicated route
 * (/knowledge/[id]/documents), same "separate route per KB concern"
 * precedent S04/S06/S07/S08/S09 already established. Read-only — no
 * upload entry point here, same "the link is added by the story that
 * builds the destination" precedent knowledge-detail.tsx's own 編輯/
 * 權限設定/成員設定/提示詞設定/模型設定 links each followed (S03/S06/
 * S07/S08/S09 each added their own link retroactively once their route
 * existed, rather than an earlier story stubbing a link to nothing);
 * E05-S011 "Single-file upload" is this story's own not-yet-built
 * destination, so no 上傳文件 entry point exists yet.
 *
 * Two sequential fetches, not parallel: getKnowledgeBase(id) first, and
 * only once that resolves to a real knowledge base does it fetch
 * listKnowledgeBaseDocuments(id) — documents are meaningless without a
 * confirmed-existing parent, so there's no reason to ask for them
 * before the knowledge base itself is confirmed to exist. A dedicated
 * test verifies listKnowledgeBaseDocuments is never called when the
 * knowledge base fetch resolves not-found or error.
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

      {documents.length === 0 && <EmptyState message="這個知識庫尚無文件。" />}

      {documents.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {documents.map((document) => (
            <li key={document.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
              <strong>{document.name}</strong>
              <br />
              <span>{formatFileSize(document.sizeBytes)}</span>
              <br />
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

/**
 * Duplicated from conversations/[id]/_components/file-attachment-picker.tsx
 * (E03-S008) rather than extracted into a shared module — that file
 * belongs to E03 (a different domain, outside this story's allowed
 * scope), and STORY_WORKFLOW's Domain Ownership Boundary forbids
 * reaching into another domain's file to refactor it even for a
 * genuinely identical 4-line helper. A real shared formatter would
 * belong in a package like `@ai-km/ui`, which is a decision bigger than
 * this one story should make unilaterally.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
