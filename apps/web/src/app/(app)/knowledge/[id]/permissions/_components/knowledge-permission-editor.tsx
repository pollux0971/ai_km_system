"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Role } from "@ai-km/permissions";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getKnowledgeBase, updateKnowledgeBaseVisibleRoles } from "@/lib/knowledge-bases";
import { ALL_ROLES, roleLabel } from "@/lib/role-labels";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-permission-editor");

type LoadState = { status: "loading" } | { status: "error" } | { status: "not-found" } | { status: "loaded" };

/**
 * E05-S006 "KB permission editor". A dedicated route
 * (/knowledge/[id]/permissions), not a section bolted onto S04's edit
 * form or S05's detail page — mirrors S04's own already-established
 * "separate route per KB concern" precedent (over E03's "everything
 * inline on one detail page" shape), so this story stays purely
 * additive and never touches S04/S05's already-approved files beyond a
 * single new link out to here.
 *
 * Models "who can see this KB" as a plain `Role[]` multi-select
 * checkbox group — same interaction as KnowledgeSelector
 * (conversations/[id]/_components/knowledge-selector.tsx, E03-S004):
 * toggle applies IMMEDIATELY (no separate submit button), non-optimistic
 * (this mock resolves near-instantly), disabled `<fieldset>` during a
 * pending request physically prevents a second toggle from racing the
 * first. `ALL_ROLES` (lib/role-labels.ts) supplies the fixed checkbox
 * set — every Role this codebase's type system knows about
 * (@ai-km/permissions), the same shared type that package's own doc
 * comment already names for exactly this "Team A renders UI state" use.
 * Since every toggle auto-saves (no submit-and-redirect flow the way
 * /knowledge/new or /knowledge/[id]/edit has), the only navigation this
 * page needs to add itself is a plain "返回知識庫詳情" link back to
 * /knowledge/[id] — nothing here otherwise leaves the page.
 *
 * This is a SETTING, not enforcement: nothing here changes what any
 * other page actually shows a given user — there is no real per-user KB
 * retrieval anywhere in this codebase yet for a permission to gate (E06
 * Knowledge Ingestion doesn't exist). Building fake enforcement on top
 * of this mock (e.g. filtering the list by the viewer's own role) would
 * be exactly the "以 mock 假裝 production path 已完成" DEVELOPMENT_POLICY
 * forbids — see lib/knowledge-bases.ts's own doc comment on
 * updateKnowledgeBaseVisibleRoles for the same point. Real enforcement
 * is Team B's job once E02 (Identity, RBAC & Authorization) and E06
 * exist; SOURCE_BASELINE.md §5 pinned decision #35 ("Team A 不等待
 * Backend 完成才開始") is why this story still builds the editor now
 * rather than waiting or being BLOCKED.
 *
 * Loading/error/not-found states on the initial fetch mirror
 * EditKnowledgeBase/KnowledgeDetail's own established pattern.
 *
 * Functional AC 7 (audit event for sensitive operations) IS applicable
 * here, unlike S003-S005's metadata-only mutations — changing who can
 * access a resource is exactly what "sensitive operation" means. Role
 * identifiers are fixed-vocabulary categorical labels, not secrets or
 * enterprise content, so (unlike S003/S004's deliberate choice not to
 * log entered name/description text) the trackEvent payload below
 * includes the actual from/to role lists — a permission-change audit
 * trail that didn't record what changed would defeat its own purpose.
 */
export default function KnowledgePermissionEditor({ id }: { id: string }) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [roles, setRoles] = useState<Role[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading knowledge base for permission editing", { correlationId, id });

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

      logger.info("knowledge base loaded for permission editing", { correlationId, id });
      setRoles(result.value.visibleToRoles ?? []);
      setLoadState({ status: "loaded" });
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleToggle(role: Role, checked: boolean) {
    const nextRoles = checked ? [...roles, role] : roles.filter((existing) => existing !== role);

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("updating knowledge base permission", { correlationId, id, from: roles, to: nextRoles });
    trackEvent("knowledge_base_permission_attempt", {
      correlationId,
      properties: { knowledgeBaseId: id, from: roles, to: nextRoles },
    });

    const result = await updateKnowledgeBaseVisibleRoles(id, nextRoles);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to update knowledge base permission", { correlationId, id, code: result.error.code });
      trackEvent("knowledge_base_permission_failure", {
        correlationId,
        properties: { knowledgeBaseId: id, code: result.error.code },
      });
      setError(true);
      return;
    }

    logger.info("knowledge base permission updated", { correlationId, id, roles: result.value.visibleToRoles });
    trackEvent("knowledge_base_permission_success", {
      correlationId,
      properties: { knowledgeBaseId: id, roles: result.value.visibleToRoles },
    });
    setRoles(result.value.visibleToRoles ?? []);
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
      <h1>知識庫權限設定</h1>
      <fieldset disabled={pending}>
        <legend>可存取此知識庫的角色</legend>
        {ALL_ROLES.map((role) => (
          <div key={role}>
            <label>
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={(event) => handleToggle(role, event.target.checked)}
              />
              {roleLabel(role)}
            </label>
          </div>
        ))}
      </fieldset>
      {pending && (
        <p role="status" style={{ marginTop: 8 }}>
          儲存中…
        </p>
      )}
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="更新權限失敗，請稍後再試。" />
        </div>
      )}
      <p style={{ marginTop: 16 }}>
        <Link href={`/knowledge/${id}`}>返回知識庫詳情</Link>
      </p>
    </main>
  );
}
