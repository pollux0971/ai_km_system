"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getCitationSource, type CitationSource } from "@/lib/citations";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:citation-source-view");

/**
 * E03-S015: open-source citation navigation. SOURCE_BASELINE.md gives
 * this story only its title (line 1178, "E03-S15 Citation Open
 * Source") — no body at all, the sparsest grounding of the whole
 * citation trio (contrast S13's one-line example, S14's three-item
 * field list). The epic file's expanded title, "Open-source citation
 * navigation", is what grounds this as an actual NAVIGATION (a route
 * you go to), not e.g. a modal or an in-place expansion — mirroring
 * how prior stories in this epic have treated the epic file's expanded
 * title as authoritative UI-pattern grounding beyond SOURCE_BASELINE's
 * bare title (e.g. E03-S12/S14's "interaction"/"drawer" wording).
 *
 * Reuses E03-S014's `getCitationSource` unchanged — this route is a
 * second, independent consumer of the same by-id lookup (no new lib
 * function needed), proving the citation id is genuinely a portable
 * identifier and not something the drawer invented for itself.
 *
 * Deliberately distinct in PURPOSE from S14's drawer, even though both
 * read the same File/Page/Snippet fields: the drawer is a quick
 * in-context glance, while this route is meant to be "the real
 * document, opened" — a full-document viewer. Since there is no real
 * document store, Object Storage, or rendering service (E04/E12, Team
 * B, don't exist — and the Frontend/BFF boundary forbids this app from
 * talking to Object Storage directly even if one did), that's exactly
 * what's honestly missing here: an explicitly-labeled placeholder
 * stands in for where full document content would render, rather than
 * silently reusing the drawer's snippet as if it were the whole
 * document. Same honesty bar as every other mock in this codebase
 * (MOCK_REPLY's "（模擬回覆）" prefix, S05's "尚未啟用" cloud model).
 *
 * A flat top-level route (`/citations/[id]`, not nested under
 * `/conversations/[conversationId]/`) — `getCitationSource` is not
 * conversation-scoped (see lib/citations.ts), so nesting under a
 * specific conversation would imply a relationship that doesn't exist
 * in this data model. No "back to conversation" link: the persistent
 * sidebar nav (AppShell, always present for every route in the (app)
 * group) is already this app's established wayfinding, the same as
 * /profile has no bespoke back-link either.
 *
 * Reachable via a same-tab `<Link>` from CitationPreviewDrawer, not
 * `target="_blank"` — nothing in SOURCE_BASELINE specifies new-tab
 * behavior, and every other navigation in this app (conversation list,
 * sidebar, "查看全部對話", etc.) is same-tab; opening a new tab would be
 * an unrequested, untested-precedent complication for a detail this
 * story's grounding never mentions.
 */
type State = { status: "loading" } | { status: "error"; code: string } | { status: "loaded"; source: CitationSource };

export function CitationSourceView({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading citation source for open-source view", { correlationId, citationId: id });
    trackEvent("conversation_citation_open_source_attempt", { correlationId, properties: { citationId: id } });

    getCitationSource(id).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load citation source", { correlationId, citationId: id, code: result.error.code });
        trackEvent("conversation_citation_open_source_failure", {
          correlationId,
          properties: { citationId: id, code: result.error.code },
        });
        setState({ status: "error", code: result.error.code });
        return;
      }

      logger.info("citation source loaded for open-source view", { correlationId, citationId: id });
      trackEvent("conversation_citation_open_source_success", { correlationId, properties: { citationId: id } });
      setState({ status: "loaded", source: result.value });
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
        <ErrorMessage code={state.code} message={state.code === "NOT_FOUND" ? "找不到這個引用來源。" : undefined} />
      </main>
    );
  }

  return (
    <main style={{ padding: 32 }}>
      <h1>原始來源</h1>
      <dl>
        <dt>檔案</dt>
        <dd>{state.source.file}</dd>
        <dt>頁碼</dt>
        <dd>{state.source.page}</dd>
      </dl>
      <div style={{ marginTop: 16, border: "1px solid", padding: 16 }}>
        <p>（模擬版面）真正的文件內容檢視器依賴 Object Storage 與文件渲染服務（E04、E12，Team B），目前都還不存在，以下不是真正的文件內容，僅顯示版面配置預覽。</p>
        <p>{state.source.snippet}</p>
      </div>
    </main>
  );
}
