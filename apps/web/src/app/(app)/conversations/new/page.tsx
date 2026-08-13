"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createConversation } from "@/lib/conversations";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:conversations-new");

type State = { status: "creating" } | { status: "error" };

/**
 * E03-S001: creates a new conversation, then redirects to /conversations
 * (where it now appears at the top of the list, via
 * lib/conversations.ts's shared store). The actual chat interface —
 * composing/sending messages — is out of scope; that's E03-S002's
 * "Normal/Advanced mode switch" and beyond. This route only proves the
 * "start a new conversation" entity-creation action itself works.
 *
 * startedRef guards against React StrictMode's dev-mode double-invoke
 * of effects creating two conversations from one visit (AC5: retries/
 * duplicate invocations must not cause an undefined duplicate side
 * effect) — see conversation-list.test.tsx-adjacent page.test.tsx for
 * the StrictMode-wrapped regression test.
 *
 * router.refresh() after a successful create invalidates Next.js's
 * client-side Router Cache — without it, navigating back to an
 * already-visited route (e.g. Home, visited once right after login)
 * can keep showing what it looked like on that first visit instead of
 * re-running its data fetch, so the Recent Conversations widget there
 * wouldn't pick up a conversation created afterward. Standard practice
 * for any mutating action, not specific to this route.
 */
export default function NewConversationPage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "creating" });
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const correlationId = crypto.randomUUID();
    logger.info("creating conversation", { correlationId });
    trackEvent("conversation_create_attempt", { correlationId });

    createConversation().then((result) => {
      if (!result.ok) {
        logger.error("failed to create conversation", { correlationId, code: result.error.code });
        trackEvent("conversation_create_failure", { correlationId, properties: { code: result.error.code } });
        setState({ status: "error" });
        return;
      }

      logger.info("conversation created", { correlationId, conversationId: result.value.id });
      trackEvent("conversation_create_success", { correlationId, properties: { conversationId: result.value.id } });
      router.refresh();
      router.replace("/conversations");
    });
  }, [router]);

  if (state.status === "error") {
    return (
      <main style={{ padding: 32 }}>
        <ErrorMessage message="無法建立新對話，請稍後再試。" />
      </main>
    );
  }

  return (
    <main style={{ padding: 32 }}>
      <LoadingIndicator label="建立新對話中…" />
    </main>
  );
}
