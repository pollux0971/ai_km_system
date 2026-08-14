"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getKnowledgeBase, updateKnowledgeBaseMembers } from "@/lib/knowledge-bases";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-member-editor");

type LoadState = { status: "loading" } | { status: "error" } | { status: "not-found" } | { status: "loaded" };

/**
 * E05-S007 "KB member editor". Complements S006's role-based
 * `visibleToRoles` with per-specific-person access, same "editor is its
 * own separate route" precedent S04/S06 already established (not
 * bolted onto S05's detail page or any other existing route).
 *
 * `members` are opaque identifier strings the user types, not picked
 * from a real directory — E02-S01 "User Entity" (Team B) doesn't exist,
 * and this codebase has no general "list of users" anywhere to pick
 * from (packages/auth-client's 3 mock accounts are login fixtures for
 * E2E tests, not a user directory this story could legitimately treat
 * as one). See KnowledgeBaseSummary.members's own doc comment.
 *
 * Add/remove apply IMMEDIATELY (each is its own committed
 * updateKnowledgeBaseMembers() call, no separate "save" step) — same
 * instant-apply precedent as S06's checkbox group, natural for a
 * discrete list-editing action. Non-optimistic (this mock resolves
 * near-instantly). The add input's own value is only cleared after a
 * SUCCESSFUL add, so a failed attempt leaves the typed text in place to
 * retry — same "don't make the user retype on failure" precedent as
 * every other form in this codebase.
 *
 * This is a SETTING, not enforcement — same boundary
 * updateKnowledgeBaseVisibleRoles's own doc comment establishes:
 * nothing here changes what any other page actually shows a given
 * user. Real enforcement is Team B's job once E02/E06 exist.
 *
 * Functional AC 7 (audit event) is applicable, same reasoning as S06 —
 * changing who has access is a sensitive operation. The trackEvent
 * payload includes the actual before/after member lists — member
 * identifiers already appear in this codebase's existing telemetry/logs
 * elsewhere as `userId` (e.g. session-gate.tsx's own "session bootstrap
 * succeeded" log), so this isn't a new category of logged data, and an
 * audit trail that didn't record who was added/removed would defeat
 * its own purpose.
 */
export default function KnowledgeMemberEditor({ id }: { id: string }) {
  const inputId = useId();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [members, setMembers] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading knowledge base for member editing", { correlationId, id });

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

      logger.info("knowledge base loaded for member editing", { correlationId, id });
      setMembers(result.value.members ?? []);
      setLoadState({ status: "loaded" });
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function saveMembers(nextMembers: string[]) {
    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("updating knowledge base members", { correlationId, id, from: members, to: nextMembers });
    trackEvent("knowledge_base_members_attempt", {
      correlationId,
      properties: { knowledgeBaseId: id, from: members, to: nextMembers },
    });

    const result = await updateKnowledgeBaseMembers(id, nextMembers);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to update knowledge base members", { correlationId, id, code: result.error.code });
      trackEvent("knowledge_base_members_failure", {
        correlationId,
        properties: { knowledgeBaseId: id, code: result.error.code },
      });
      setError(true);
      return false;
    }

    logger.info("knowledge base members updated", { correlationId, id, members: result.value.members });
    trackEvent("knowledge_base_members_success", {
      correlationId,
      properties: { knowledgeBaseId: id, members: result.value.members },
    });
    setMembers(result.value.members ?? []);
    return true;
  }

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || pending) return;

    const succeeded = await saveMembers([...members, trimmed]);
    if (succeeded) setDraft("");
  }

  async function handleRemove(member: string) {
    if (pending) return;
    await saveMembers(members.filter((existing) => existing !== member));
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
      <h1>知識庫成員設定</h1>
      <form onSubmit={handleAdd}>
        <label htmlFor={inputId}>新增成員(使用者代號)</label>
        <br />
        <input
          id={inputId}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={pending}
        />
        <button type="submit" disabled={pending || draft.trim().length === 0}>
          新增
        </button>
      </form>

      {members.length === 0 ? (
        <p>尚無成員。</p>
      ) : (
        <ul>
          {members.map((member) => (
            <li key={member}>
              {member}{" "}
              <button type="button" onClick={() => handleRemove(member)} disabled={pending}>
                移除
              </button>
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <p role="status" style={{ marginTop: 8 }}>
          儲存中…
        </p>
      )}
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="更新成員失敗，請稍後再試。" />
        </div>
      )}
      <p style={{ marginTop: 16 }}>
        <Link href={`/knowledge/${id}`}>返回知識庫詳情</Link>
      </p>
    </main>
  );
}
