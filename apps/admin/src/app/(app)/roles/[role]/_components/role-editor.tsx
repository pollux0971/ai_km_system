"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { getRole, updateRoleDescription, type RoleSummary } from "@/lib/roles";

const logger = createLogger("admin:role-editor");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "loaded"; summary: RoleSummary };

/**
 * E11-S007 "Role editor" — same loading/error/not-found/loaded shape
 * UserDetail (E11-S003) already establishes for a single-record page
 * reached by a route param that isn't guaranteed to resolve.
 *
 * Once loaded, this page IS the editor (a dedicated `/roles/{role}`
 * route, same separate-route shape EditKnowledgeBase already
 * establishes for editing a record's own descriptive text) rather than
 * a read-mode/edit-mode toggle the way RenameConversation/
 * KnowledgeDocumentNameEditor work — those live inline in a list row
 * that keeps existing regardless of edit state; this page has no
 * "outside the editor" state to toggle back to. `role` itself is
 * read-only (a fixed system enum, not user-renamable); only
 * `description` is editable.
 *
 * Unlike EditKnowledgeBase (redirects to the list on success), success
 * here stays on the same page and updates the displayed description —
 * this page also serves as the role's own detail view, so an admin
 * confirming their own edit worked shouldn't have to navigate back in.
 */
export default function RoleEditor({ role }: { role: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const descriptionId = useId();

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading role", { correlationId, role });

    getRole(role).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load role", { correlationId, role, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      if (!result.value) {
        logger.info("role not found", { correlationId, role });
        setState({ status: "not-found" });
        return;
      }

      logger.info("role loaded", { correlationId, role });
      setState({ status: "loaded", summary: result.value });
      setDescription(result.value.description);
    });

    return () => {
      cancelled = true;
    };
  }, [role]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = description.trim();
    if (!trimmed || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    setSaved(false);
    logger.info("saving role description", { correlationId, role });

    const result = await updateRoleDescription(role, trimmed);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to save role description", { correlationId, role, code: result.error.code });
      setError(true);
      return;
    }

    logger.info("role description saved", { correlationId, role });
    setDescription(result.value.description);
    setSaved(true);
  }

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入角色資料。" />;
  }

  if (state.status === "not-found") {
    return <ErrorMessage message="找不到這個角色。" />;
  }

  return (
    <div>
      <h1>{state.summary.role}</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={descriptionId}>角色說明</label>
          <br />
          <textarea
            id={descriptionId}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setSaved(false);
            }}
            disabled={pending}
          />
        </div>
        <button type="submit" disabled={pending || description.trim().length === 0}>
          儲存
        </button>{" "}
        <Link href="/roles">取消</Link>
      </form>
      {saved && <p>已儲存。</p>}
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="儲存失敗，請稍後再試。" />
        </div>
      )}
    </div>
  );
}
