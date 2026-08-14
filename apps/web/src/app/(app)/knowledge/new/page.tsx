"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { createKnowledgeBase } from "@/lib/knowledge-bases";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-new");

/**
 * E05-S003 "Create KB form" — a real form (unlike E03-S001's
 * conversations/new, a zero-input auto-create-and-redirect route: a
 * conversation defaults its title to "新對話", but a knowledge base is a
 * longer-lived, name-picked container, so `name` is real required user
 * input here). `/knowledge` (E05-S001) deliberately left out an entry
 * point to this route; this story is exactly what adds it.
 *
 * Submit is disabled until `name` is non-empty after trimming — same
 * "defense in depth, not the only guard" precedent as
 * rename-conversation.tsx: createKnowledgeBase() also fails closed with
 * VALIDATION_ERROR server-side, so a buggy/bypassed client still can't
 * persist a blank name. That same `disabled` also prevents a double
 * submit from a duplicate click while a request is already pending
 * (Functional AC 5).
 *
 * Not optimistic — same precedent as ModeSwitch/ModelSelector/
 * RenameConversation (this mock resolves near-instantly, nothing real
 * to hide behind an optimistic update): the entered values stay on
 * screen and unsaved until creation is confirmed, and stay put (not
 * cleared) if it fails, so the user doesn't have to retype anything to
 * retry.
 *
 * Redirects to /knowledge (the list), not to a detail page —
 * /knowledge/[id] (E05-S05 "KB Detail") doesn't exist yet, same
 * constraint knowledge-list.tsx already documents for why its own items
 * aren't linked yet.
 */
export default function NewKnowledgeBasePage() {
  const router = useRouter();
  const nameId = useId();
  const descriptionId = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("creating knowledge base", { correlationId });
    trackEvent("knowledge_base_create_attempt", { correlationId });

    const result = await createKnowledgeBase(trimmedName, description);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to create knowledge base", { correlationId, code: result.error.code });
      trackEvent("knowledge_base_create_failure", { correlationId, properties: { code: result.error.code } });
      setError(true);
      return;
    }

    logger.info("knowledge base created", { correlationId, knowledgeBaseId: result.value.id });
    trackEvent("knowledge_base_create_success", { correlationId, properties: { knowledgeBaseId: result.value.id } });
    router.refresh();
    router.replace("/knowledge");
  }

  return (
    <main style={{ padding: 32 }}>
      <h1>新增知識庫</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={nameId}>知識庫名稱</label>
          <br />
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={pending}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={descriptionId}>說明</label>
          <br />
          <textarea
            id={descriptionId}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={pending}
          />
        </div>
        <button type="submit" disabled={pending || name.trim().length === 0}>
          建立
        </button>{" "}
        <Link href="/knowledge">取消</Link>
      </form>
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="無法建立知識庫，請稍後再試。" />
        </div>
      )}
    </main>
  );
}
