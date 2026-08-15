"use client";

import { useState } from "react";
import type { Role } from "@ai-km/permissions";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { updateKnowledgeBaseDocumentVisibleRoles } from "@/lib/knowledge-documents";
import { ALL_ROLES, roleLabel } from "@/lib/role-labels";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-document-permission-editor");

/**
 * E05-S027 "Document permission editor". Combines two already-approved
 * precedents rather than inventing a third shape: the CONTENT model
 * (role checkbox group, toggle-saves-immediately, disabled fieldset
 * while pending) is KnowledgePermissionEditor's (E05-S006, the KB-level
 * editor at /knowledge/[id]/permissions); the STRUCTURE (an
 * aria-expanded toggle button revealing inline content within a list
 * item) is KnowledgeDocumentPreview's (E05-S022). A dedicated route the
 * way S006 has one doesn't fit here — a knowledge base has exactly ONE
 * permission set, but this page already renders a growing list of many
 * documents, each needing its own independent editor; the established
 * split in this domain (see knowledge-document-list.tsx's own doc
 * comment) is "one KB-level concern → its own route" vs. "one
 * per-document concern → inline in the list", and this is squarely the
 * second kind, same as archive/delete/rename/retry/preview.
 *
 * updateKnowledgeBaseDocumentVisibleRoles takes the complete new role
 * list (not one add/remove at a time), same as its KB-level counterpart
 * — see that function's own doc comment. Same "setting only, no real
 * enforcement point" caveat as S006: nothing in this codebase yet
 * performs real per-user document retrieval this would gate (E06
 * Knowledge Ingestion doesn't exist), so this deliberately doesn't wire
 * up any fake filtering on top of the mock. Role identifiers are plain
 * fixed-vocabulary values, not enterprise content, so — like S006 —
 * telemetry includes the actual from/to role lists.
 */
export default function KnowledgeDocumentPermissionEditor({
  knowledgeBaseId,
  documentId,
  initialVisibleToRoles,
}: {
  knowledgeBaseId: string;
  documentId: string;
  initialVisibleToRoles?: Role[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [roles, setRoles] = useState<Role[]>(initialVisibleToRoles ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleToggleRole(role: Role, checked: boolean) {
    const nextRoles = checked ? [...roles, role] : roles.filter((existing) => existing !== role);

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("updating document permission", { correlationId, knowledgeBaseId, documentId, from: roles, to: nextRoles });
    trackEvent("knowledge_base_document_permission_attempt", {
      correlationId,
      properties: { knowledgeBaseId, documentId, from: roles, to: nextRoles },
    });

    const result = await updateKnowledgeBaseDocumentVisibleRoles(knowledgeBaseId, documentId, nextRoles);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to update document permission", { correlationId, knowledgeBaseId, documentId, code: result.error.code });
      trackEvent("knowledge_base_document_permission_failure", {
        correlationId,
        properties: { knowledgeBaseId, documentId, code: result.error.code },
      });
      setError(true);
      return;
    }

    logger.info("document permission updated", { correlationId, knowledgeBaseId, documentId, roles: result.value.visibleToRoles });
    trackEvent("knowledge_base_document_permission_success", {
      correlationId,
      properties: { knowledgeBaseId, documentId, roles: result.value.visibleToRoles },
    });
    setRoles(result.value.visibleToRoles ?? []);
  }

  return (
    <>
      <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
        {expanded ? "收合文件權限" : "文件權限"}
      </button>
      {expanded && (
        <div style={{ marginTop: 4 }}>
          <fieldset disabled={pending}>
            <legend>可存取此文件的角色</legend>
            {ALL_ROLES.map((role) => (
              <div key={role}>
                <label>
                  <input
                    type="checkbox"
                    checked={roles.includes(role)}
                    onChange={(event) => handleToggleRole(role, event.target.checked)}
                  />
                  {roleLabel(role)}
                </label>
              </div>
            ))}
          </fieldset>
          {pending && (
            <p role="status" style={{ marginTop: 4 }}>
              儲存中…
            </p>
          )}
          {error && (
            <div style={{ marginTop: 4 }}>
              <ErrorMessage message="更新文件權限失敗，請稍後再試。" />
            </div>
          )}
        </div>
      )}
    </>
  );
}
