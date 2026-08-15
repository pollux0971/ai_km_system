"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getKnowledgeBase, type KnowledgeBaseSummary } from "@/lib/knowledge-bases";
import { listKnowledgeBaseDocuments, type KnowledgeBaseDocument } from "@/lib/knowledge-documents";
import KnowledgeDocumentUpload from "./knowledge-document-upload";
import KnowledgeDocumentUrlImport from "./knowledge-document-url-import";
import KnowledgeDocumentTextInput from "./knowledge-document-text-input";
import KnowledgeDocumentRetryButton from "./knowledge-document-retry-button";
import KnowledgeDocumentPreview from "./knowledge-document-preview";
import KnowledgeDocumentNameEditor from "./knowledge-document-name-editor";
import KnowledgeDocumentArchiveToggle from "./knowledge-document-archive-toggle";
import KnowledgeDocumentDeleteButton from "./knowledge-document-delete-button";
import KnowledgeDocumentPermissionEditor from "./knowledge-document-permission-editor";
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
 * E05-S015 "Text knowledge input" adds a third source,
 * KnowledgeDocumentTextInput, same page, same `refetchDocuments`
 * callback (passed as `onAdded`). Needed no changes to the list
 * rendering below — a text-input document always has a real, computed
 * `sizeBytes` (see addKnowledgeBaseDocumentFromText's own doc
 * comment), so the existing conditional-size-rendering logic already
 * added for S014 handles it correctly with zero further changes; its
 * stored `content` is never rendered here (or anywhere yet) — same
 * "input ≠ view" scope discipline this page's every other summary
 * field already follows (e.g. boundPrompt's own summary never shows
 * the prompt text itself).
 *
 * E05-S020 "Processing failure state" adds a plain "處理失敗" text
 * indicator for any document with `status === "failed"` (see that
 * field's own doc comment on KnowledgeBaseDocument) — plain text, not
 * a color-only cue, per this story's own UX Acceptance ("不得只靠
 * 顏色傳達狀態").
 *
 * E05-S021 "Retry processing action" adds KnowledgeDocumentRetryButton
 * right next to that same indicator, only for a failed document — the
 * direct next step S020 itself deferred. Its own `onRetried` prop is
 * this same `refetchDocuments`, exactly like every other
 * list-changing widget on this page already receives — a successful
 * retry is "the list changed" the same way a new upload is.
 *
 * E05-S022 "Document preview" adds KnowledgeDocumentPreview for EVERY
 * document (not just failed ones), passing `document.content` through
 * as-is. Needs no new fetch of its own — `content` is already part of
 * the KnowledgeBaseDocument objects this component already has in
 * `documents`; it's purely a client-side reveal/hide toggle over data
 * already in hand. See that component's own doc comment for why only
 * text-input (S015) documents have real content to show, and why a
 * file/URL-sourced document gets an honest "cannot be previewed"
 * message instead of fabricated text.
 *
 * E05-S023 "Document metadata editor" replaces the plain
 * `<strong>{document.name}</strong>` this list has rendered since S010
 * with KnowledgeDocumentNameEditor, which OWNS that same display
 * outright (mirroring RenameConversation's own "own the element, don't
 * bolt an edit affordance next to a separately-rendered static value"
 * structure) — it renders its own name display in both its view and
 * edit states, this component doesn't render `document.name` directly
 * anywhere else anymore.
 *
 * E05-S025 "Archive document action" adds `viewingArchived`, a SWITCH
 * between two mutually-exclusive views via a role="group" aria-pressed
 * button pair ("作用中文件"/"已封存文件") — directly mirroring
 * ConversationList's own (E03-S026) "archived is a view selector, not
 * an include-toggle" split, matching listKnowledgeBaseDocuments' own
 * `archived` parameter shape. Unlike ConversationList, `viewingArchived`
 * is deliberately NOT added to the mount effect's dependency array:
 * that effect also owns `knowledgeBase` and the two-sequential-fetches
 * not-found/error handling, so re-running it on every view switch would
 * flash the whole page (heading, add-widgets, everything) back to a
 * loading spinner just to swap the document list. Instead
 * handleViewChange calls refetchDocuments(archived) directly — the
 * exact same "silent in-place refresh" already used after every mutation
 * on this page (upload/rename/retry/archive), just with an explicit
 * view argument instead of the default. That default is what every
 * mutation's own onSuccess callback relies on: archiving/unarchiving a
 * document re-fetches the CURRENT view, which is exactly what makes the
 * just-toggled item disappear from it. The three add-widgets (upload/URL
 * import/text input) only render for the active view — adding a
 * document while looking at the archive would either need to silently
 * switch views out from under the user or leave the newly-added (always
 * non-archived, per KnowledgeBaseDocument.archived's own doc comment)
 * item invisible in the view still on screen; hiding the widgets
 * sidesteps both. A third empty-state message ("尚無已封存的文件。")
 * covers viewing-archived-with-zero-results, same reasoning as
 * ConversationList's own third message — reusing "這個知識庫尚無文件。"
 * here would be false whenever active documents exist and only the
 * archive is empty. KnowledgeDocumentArchiveToggle receives
 * `document.archived ?? false` (absence-means-not-archived, per that
 * field's own doc comment) and the same `() => refetchDocuments()`
 * shape every other mutating child on this page already receives.
 *
 * refetchDocuments' default (`archived: boolean = viewingArchivedRef.
 * current`) reads a ref, not the `viewingArchived` state variable
 * directly — hiding the add-widgets while viewing the archive means
 * KnowledgeDocumentUpload can now unmount mid-upload (switching views
 * mid-upload unmounts it, since it stops matching `!viewingArchived`),
 * but its own async upload sequence (knowledge-document-upload.tsx has
 * no unmount guard around it, same as every sibling add-widget) keeps
 * running and still calls the `onUploaded` it was given when it
 * mounted. That callback is a `refetchDocuments` closure from the
 * render where the upload started — if its default read the plain
 * `viewingArchived` variable, it would freeze whatever view was active
 * at that render forever, and the stale callback firing after a view
 * switch would silently overwrite the now-displayed view's list with
 * the OTHER view's documents while the toggle buttons still claimed the
 * view never changed. The ref is mutated on every render (see below),
 * so a default relying on `.current` always reads whichever view is
 * actually on screen at the moment the callback fires, regardless of
 * which render originally captured it — turning every stale mutation
 * callback into "refresh whatever the user is currently looking at",
 * which is the only reading that's ever correct.
 *
 * E05-S026 "Delete document confirmation" adds
 * KnowledgeDocumentDeleteButton for EVERY document, in both views
 * (unlike the three add-widgets, deletion isn't restricted to the
 * active view — an archived document can still be permanently removed,
 * see deleteKnowledgeBaseDocument's own doc comment for why archiving
 * and deleting stay two independent, orthogonal capabilities). Its
 * `onDeleted` is the same `refetchDocuments` every other mutating child
 * on this page already receives — a successful delete re-fetches
 * whichever view the user is currently on (via the same
 * viewingArchivedRef-backed default described above), which is exactly
 * what makes the just-deleted document disappear from it.
 *
 * E05-S027 "Document permission editor" adds
 * KnowledgeDocumentPermissionEditor for EVERY document, in both views —
 * same "orthogonal to archived state" reasoning as the delete button
 * right above it. Combines KnowledgePermissionEditor's (S006) role-
 * checkbox CONTENT with KnowledgeDocumentPreview's (S022) inline
 * expand/collapse STRUCTURE, rather than a fourth dedicated
 * /knowledge/[id]/... route: a knowledge base has exactly one
 * permission set (worth its own route), but this page already renders
 * a growing list of many documents, each needing an independent editor
 * — the same "per-document concern lives inline in the list" shape
 * archive/delete/rename/retry/preview already established. Passes
 * `document.visibleToRoles` straight through as `initialVisibleToRoles`
 * — no onSaved/refetch callback, same shape as
 * KnowledgeDocumentNameEditor's own `initialName` prop (S023): a
 * permission change never alters which VIEW the document belongs to
 * (unlike archive/delete) or anything else this list renders about it,
 * so the editor owns and reflects its own saved state entirely by
 * itself, exactly like the name editor already does.
 *
 * E05-S029 "Document state badges" upgrades the S020 "處理失敗"
 * indicator to `<span role="alert">` and adds a new `<span
 * role="status">已封存</span>` for archived documents — mirroring
 * message-thread.tsx's own already-established badge convention
 * (role="alert" for failure/attention states like "傳送失敗", role=
 * "status" for benign informational ones like "傳送中…"), which this
 * indicator never had despite being the same kind of state marker. No
 * explicit "ready"/normal badge is added for symmetry — that same
 * precedent never shows one for an ordinarily-settled message either;
 * badge ABSENCE already means "nothing noteworthy" throughout this
 * codebase, and inventing a new "就緒" badge would break that
 * convention rather than follow it. The archived badge is genuinely
 * redundant with the page-level 已封存文件 view toggle (a document can
 * only ever be rendered here when its own state matches the current
 * view, so every item in that view already satisfies `archived ===
 * true`) — kept anyway for the same reason role="alert"/role="status"
 * exist at all: explicit, redundant state communication per item, not
 * relying on a screen reader user to recall an earlier page-level
 * toggle's pressed state while navigating item by item.
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
  const [viewingArchived, setViewingArchived] = useState(false);
  const viewingArchivedRef = useRef(viewingArchived);
  viewingArchivedRef.current = viewingArchived;

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
      const documentsResult = await listKnowledgeBaseDocuments(id, false);
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

  async function refetchDocuments(archived: boolean = viewingArchivedRef.current) {
    const correlationId = crypto.randomUUID();
    logger.info("refreshing document list", { correlationId, id, archived });
    const documentsResult = await listKnowledgeBaseDocuments(id, archived);

    if (!documentsResult.ok) {
      // Same "secondary fetch failure shouldn't discard an
      // otherwise-successful page" reasoning as knowledge-detail.tsx's
      // own documentCount fetch — the upload itself already succeeded
      // and the page is already showing a valid (if now slightly
      // stale) list; silently keep it rather than erroring the whole
      // page over a refresh that failed after the real work was done.
      logger.error("failed to refresh document list", { correlationId, id, archived, code: documentsResult.error.code });
      return;
    }

    logger.info("document list refreshed", { correlationId, id, archived, count: documentsResult.value.length });
    setState((prev) => (prev.status === "loaded" ? { ...prev, documents: documentsResult.value } : prev));
  }

  function handleViewChange(archived: boolean) {
    if (archived === viewingArchived) return;
    setViewingArchived(archived);
    refetchDocuments(archived);
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

      <div role="group" aria-label="文件檢視" style={{ marginBottom: 16 }}>
        <button type="button" aria-pressed={!viewingArchived} onClick={() => handleViewChange(false)}>
          作用中文件
        </button>
        <button type="button" aria-pressed={viewingArchived} onClick={() => handleViewChange(true)}>
          已封存文件
        </button>
      </div>

      {!viewingArchived && (
        <>
          <KnowledgeDocumentUpload knowledgeBaseId={id} onUploaded={refetchDocuments} />
          <KnowledgeDocumentUrlImport knowledgeBaseId={id} onImported={refetchDocuments} />
          <KnowledgeDocumentTextInput knowledgeBaseId={id} onAdded={refetchDocuments} />
        </>
      )}

      {documents.length === 0 && (
        <EmptyState message={viewingArchived ? "尚無已封存的文件。" : "這個知識庫尚無文件。"} />
      )}

      {documents.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {documents.map((document) => (
            <li key={document.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
              <KnowledgeDocumentNameEditor knowledgeBaseId={id} documentId={document.id} initialName={document.name} />
              <br />
              {document.status === "failed" && (
                <>
                  <span role="alert">處理失敗</span>
                  <KnowledgeDocumentRetryButton
                    knowledgeBaseId={id}
                    documentId={document.id}
                    onRetried={refetchDocuments}
                  />
                  <br />
                </>
              )}
              {document.archived && (
                <>
                  <span role="status">已封存</span>
                  <br />
                </>
              )}
              {document.sizeBytes !== undefined && (
                <>
                  <span>{formatFileSize(document.sizeBytes)}</span>
                  <br />
                </>
              )}
              <time dateTime={document.uploadedAt}>{new Date(document.uploadedAt).toLocaleString("zh-TW")}</time>
              <br />
              <KnowledgeDocumentPreview knowledgeBaseId={id} documentId={document.id} content={document.content} />
              <br />
              <KnowledgeDocumentArchiveToggle
                knowledgeBaseId={id}
                documentId={document.id}
                archived={document.archived ?? false}
                onToggled={refetchDocuments}
              />
              <br />
              <KnowledgeDocumentDeleteButton
                knowledgeBaseId={id}
                documentId={document.id}
                name={document.name}
                onDeleted={refetchDocuments}
              />
              <br />
              <KnowledgeDocumentPermissionEditor
                knowledgeBaseId={id}
                documentId={document.id}
                initialVisibleToRoles={document.visibleToRoles}
              />
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
