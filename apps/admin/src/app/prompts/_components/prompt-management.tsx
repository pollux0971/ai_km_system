"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { createPrompt, listPrompts, type Prompt } from "@/lib/prompts";

const logger = createLogger("admin:prompt-management");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; prompts: Prompt[] };

/**
 * E11-S012 "Prompt admin" — same list+inline-create shape
 * DepartmentManagement (E11-S009) already establishes for a sibling
 * mock entity, with a `<textarea>` for `content` (multi-line prompt
 * text) instead of a single-line `<input>` — same "free-form text a
 * user composes and revises" reasoning apps/web's own
 * knowledge-prompt-editor.tsx doc comment already establishes for the
 * sibling `boundPrompt` field.
 */
export default function PromptManagement() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const nameId = useId();
  const contentId = useId();

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading prompt list", { correlationId });

    listPrompts().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load prompt list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("prompt list loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", prompts: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (state.status !== "loaded") return;

    const trimmedName = name.trim();
    const trimmedContent = content.trim();
    if (!trimmedName || !trimmedContent || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("creating prompt", { correlationId, name: trimmedName });

    const result = await createPrompt({ name: trimmedName, content: trimmedContent });
    setPending(false);

    if (!result.ok) {
      logger.error("failed to create prompt", { correlationId, code: result.error.code });
      setError(true);
      return;
    }

    logger.info("prompt created", { correlationId, promptId: result.value.promptId });
    setState({ status: "loaded", prompts: [...state.prompts, result.value] });
    setName("");
    setContent("");
  }

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入提示詞清單。" />;
  }

  return (
    <div>
      {state.prompts.length === 0 ? (
        <EmptyState message="尚無提示詞。" />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {state.prompts.map((prompt) => (
            <li key={prompt.promptId} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
              <p>
                <strong>{prompt.name}</strong>
              </p>
              <p>{prompt.content}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <label htmlFor={nameId}>提示詞名稱</label>
          <br />
          <input id={nameId} value={name} onChange={(event) => setName(event.target.value)} disabled={pending} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label htmlFor={contentId}>提示詞內容</label>
          <br />
          <textarea id={contentId} value={content} onChange={(event) => setContent(event.target.value)} disabled={pending} />
        </div>
        <button type="submit" disabled={pending || name.trim().length === 0 || content.trim().length === 0}>
          新增提示詞
        </button>
      </form>
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="新增失敗，請稍後再試。" />
        </div>
      )}
    </div>
  );
}
