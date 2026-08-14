"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getKnowledgeBase, type KnowledgeBaseSummary } from "@/lib/knowledge-bases";
import { roleLabel } from "@/lib/role-labels";
import { AI_MODELS } from "@/lib/ai-models";
import { listKnowledgeBaseDocuments } from "@/lib/knowledge-documents";

const logger = createLogger("web:knowledge-detail");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "loaded"; knowledgeBase: KnowledgeBaseSummary; documentCount: number | null };

/**
 * E05-S005 "KB detail page". KnowledgeList (E05-S001) deliberately left
 * items unlinked ("/knowledge/[id] doesn't exist yet") — this story is
 * exactly what fulfills that, same as E03-S002 did for
 * /conversations/[id]. Loading/error/not-found/loaded states mirror
 * ConversationDetail/EditKnowledgeBase's own established pattern,
 * including reusing ErrorMessage's shared NOT_FOUND code.
 *
 * Read-only — editing stays on its own separate route,
 * /knowledge/[id]/edit (E05-S004), which already existed before this
 * story added a page to link to it from. Unlike RenameConversation
 * (inline edit within an already-existing detail page), retrofitting
 * S04's already-approved, already-merged edit UI into an inline
 * on-this-page form would be an out-of-scope architecture change this
 * story's own title ("detail page", not "redesign editing") doesn't ask
 * for — this page instead links to that existing route, the same
 * "separate routes, not one shared inline widget" relationship
 * /knowledge/new and /knowledge already have.
 *
 * E05-S006 "KB permission editor" adds a one-line summary of
 * `visibleToRoles` here (labeled roles, or "尚未設定" when absent/empty)
 * plus a "權限設定" link to /knowledge/[id]/permissions — same
 * "separate route, one link out to it" relationship this page already
 * has with S04's edit route. Only a summary, not the editable checkbox
 * group itself (that stays on its own route) — this page's own job is
 * viewing, not editing.
 *
 * E05-S007 "KB member editor" adds the same shape of summary for
 * `members` (comma-joined identifiers, or "尚無成員" when absent/empty)
 * plus a "成員設定" link to /knowledge/[id]/members.
 *
 * E05-S008 "KB prompt binding UI" adds a "已設定"/"尚未設定" indicator
 * for `boundPrompt` (not the prompt TEXT itself — unlike roles/members,
 * a bound prompt can be long free-form content not suited to an inline
 * one-line summary, and showing it here would also duplicate what the
 * dedicated editor route already displays in full) plus a "提示詞設定"
 * link to /knowledge/[id]/prompt.
 *
 * E05-S009 "KB model binding UI" adds a one-line summary of
 * `boundModel` (its AI_MODELS label when bound, or "尚未綁定" when
 * absent) plus a "模型設定" link to /knowledge/[id]/model — same
 * shape as the roles/members/prompt summaries above.
 *
 * E05-S010 "KB document list" adds a document COUNT summary (not the
 * document list itself — that's the dedicated route's own job) plus a
 * "文件列表" link to /knowledge/[id]/documents. A count, not a joined
 * list of names the way roles/members are: unlike a handful of role
 * labels or member identifiers, a knowledge base's document names could
 * be numerous and individually long, unsuited to a one-line summary —
 * same reasoning `boundPrompt`'s summary shows only "已設定"/"尚未設定"
 * rather than the prompt text itself. Requires a SECOND sequential
 * fetch (listKnowledgeBaseDocuments, after getKnowledgeBase resolves) —
 * the first field on this page that isn't already part of
 * KnowledgeBaseSummary itself. A failure of that second fetch
 * specifically doesn't fail the whole page (unlike a getKnowledgeBase
 * failure) — the page's primary content (the knowledge base itself)
 * already loaded successfully, so `documentCount: null` degrades to a
 * "－" placeholder instead of discarding an otherwise-successful page
 * load over a secondary enrichment value.
 *
 * Otherwise only shows the fields KnowledgeBaseSummary currently has
 * (name/description/updatedAt) — no usage stats. That's its own later,
 * separate story (S28); this page's job is establishing the detail
 * route itself with what data exists today, not reaching ahead into
 * its scope.
 */
export default function KnowledgeDetail({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading knowledge base detail", { correlationId, id });

    getKnowledgeBase(id).then(async (result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load knowledge base detail", { correlationId, id, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      if (!result.value) {
        logger.info("knowledge base not found", { correlationId, id });
        setState({ status: "not-found" });
        return;
      }

      const knowledgeBase = result.value;
      const documentsResult = await listKnowledgeBaseDocuments(id);
      if (cancelled) return;

      if (!documentsResult.ok) {
        logger.error("failed to load document count", { correlationId, id, code: documentsResult.error.code });
        logger.info("knowledge base detail loaded", { correlationId, id });
        setState({ status: "loaded", knowledgeBase, documentCount: null });
        return;
      }

      logger.info("knowledge base detail loaded", { correlationId, id, documentCount: documentsResult.value.length });
      setState({ status: "loaded", knowledgeBase, documentCount: documentsResult.value.length });
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
        <ErrorMessage message="無法載入知識庫。" />
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

  const { knowledgeBase, documentCount } = state;
  const boundModelLabel = knowledgeBase.boundModel
    ? (AI_MODELS.find((option) => option.id === knowledgeBase.boundModel)?.label ?? knowledgeBase.boundModel)
    : "尚未綁定";
  const documentCountLabel = documentCount === null ? "－" : documentCount === 0 ? "尚無文件" : `${documentCount} 份文件`;

  return (
    <main style={{ padding: 32 }}>
      <h1>{knowledgeBase.name}</h1>
      <p>{knowledgeBase.description}</p>
      <p>
        最後更新:<time dateTime={knowledgeBase.updatedAt}>{new Date(knowledgeBase.updatedAt).toLocaleString("zh-TW")}</time>
      </p>
      <p>
        可存取角色:
        <span>
          {knowledgeBase.visibleToRoles && knowledgeBase.visibleToRoles.length > 0
            ? knowledgeBase.visibleToRoles.map(roleLabel).join("、")
            : "尚未設定"}
        </span>
      </p>
      <p>
        成員:
        <span>
          {knowledgeBase.members && knowledgeBase.members.length > 0 ? knowledgeBase.members.join("、") : "尚無成員"}
        </span>
      </p>
      <p>
        綁定提示詞:<span>{knowledgeBase.boundPrompt ? "已設定" : "尚未設定"}</span>
      </p>
      <p>
        綁定模型:<span>{boundModelLabel}</span>
      </p>
      <p>
        文件:<span>{documentCountLabel}</span>
      </p>
      <Link href={`/knowledge/${knowledgeBase.id}/edit`}>編輯</Link>
      {" · "}
      <Link href={`/knowledge/${knowledgeBase.id}/permissions`}>權限設定</Link>
      {" · "}
      <Link href={`/knowledge/${knowledgeBase.id}/members`}>成員設定</Link>
      {" · "}
      <Link href={`/knowledge/${knowledgeBase.id}/prompt`}>提示詞設定</Link>
      {" · "}
      <Link href={`/knowledge/${knowledgeBase.id}/model`}>模型設定</Link>
      {" · "}
      <Link href={`/knowledge/${knowledgeBase.id}/documents`}>文件列表</Link>
    </main>
  );
}
