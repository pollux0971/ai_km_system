"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getKnowledgeBase, type KnowledgeBaseSummary } from "@/lib/knowledge-bases";
import { roleLabel } from "@/lib/role-labels";

const logger = createLogger("web:knowledge-detail");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "loaded"; knowledgeBase: KnowledgeBaseSummary };

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
 * Otherwise only shows the fields KnowledgeBaseSummary currently has
 * (name/description/updatedAt) — no document list, model settings, or
 * usage stats. Those are each their own later, separate story (S09,
 * S10, S28); this page's job is establishing the detail route itself
 * with what data exists today, not reaching ahead into their scope.
 */
export default function KnowledgeDetail({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading knowledge base detail", { correlationId, id });

    getKnowledgeBase(id).then((result) => {
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

      logger.info("knowledge base detail loaded", { correlationId, id });
      setState({ status: "loaded", knowledgeBase: result.value });
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

  const { knowledgeBase } = state;

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
      <Link href={`/knowledge/${knowledgeBase.id}/edit`}>編輯</Link>
      {" · "}
      <Link href={`/knowledge/${knowledgeBase.id}/permissions`}>權限設定</Link>
      {" · "}
      <Link href={`/knowledge/${knowledgeBase.id}/members`}>成員設定</Link>
      {" · "}
      <Link href={`/knowledge/${knowledgeBase.id}/prompt`}>提示詞設定</Link>
    </main>
  );
}
